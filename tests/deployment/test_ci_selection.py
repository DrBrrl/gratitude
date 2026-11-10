"""Selection is a coverage boundary: test omissions, diffs and execution modes."""
from collections import Counter
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'scripts'))
import select_ci
import run_ci_walkthroughs
import ci_gate


class SelectionTests(unittest.TestCase):
    def setUp(self):
        self.config = json.loads((ROOT / 'ci/walkthroughs.json').read_text())

    def plan(self, paths=(), event=None, event_name='pull_request', root=ROOT):
        return select_ci.select(root, self.config, event_name, event or {}, list(paths))

    def ids(self, plan):
        return set(plan['scenarios'])

    def test_documentation_retains_landing_and_signed_in_navigation_smoke(self):
        plan = self.plan(['README.md', 'PROMPTS.md', 'docs/ux/mockup.png'])
        self.assertFalse(plan['full'])
        self.assertEqual(self.ids(plan), {'001', '035'})
        self.assertEqual({row['project'] for row in plan['matrix']['include']}, set(select_ci.PROJECTS))

    def test_isolated_hug_status_keeps_every_friends_consumer(self):
        plan = self.plan(['src/lib/components/HugNotifications.svelte'])
        self.assertFalse(plan['full'])
        self.assertEqual(self.ids(plan), {'001', '035', '036', '037', '038', '039', '043', '044'})

    def test_friend_changes_include_onboarding_consumers_too(self):
        plan = self.plan(['src/lib/components/Friends.svelte'])
        self.assertFalse(plan['full'])
        self.assertTrue({'036', '043', '044', '045', '046', '047', '048', '054', '055'} <= self.ids(plan))

    def test_multiple_changes_union_related_features(self):
        plan = self.plan(['src/lib/components/ImportPanel.svelte', 'src/lib/components/HugNotifications.svelte'])
        self.assertTrue({'015', '016', '036', '044'} <= self.ids(plan))
        self.assertFalse(plan['full'])

    def test_baseline_and_fixture_changes_select_their_walkthrough(self):
        plan = self.plan(['tests/e2e/012-photo-recovery/screenshots/example.png', 'tests/e2e/041-photo-model/041-photo-model.spec.ts'])
        self.assertEqual(self.ids(plan), {'001', '035', '012', '041'})

    def test_shared_runtime_rules_ci_dependencies_and_unknown_paths_run_all(self):
        for path in ['src/lib/components/GratitudeApp.svelte', 'src/routes/+layout.svelte', 'src/lib/domain.ts',
                     'src/lib/civil-date.ts', 'src/lib/firebase/repository.ts', 'src/lib/ai/context.ts',
                     'firestore.rules', 'storage.rules', 'package-lock.json', 'flake.lock',
                     'tests/e2e/helpers/friends.ts', 'scripts/select_ci.py', 'ci/walkthroughs.json',
                     '.github/workflows/ci-pages.yml', 'unrecognised-file.txt', 'E2E_GUIDE.md', 'AGENTS.md']:
            with self.subTest(path=path):
                plan = self.plan([path])
                self.assertTrue(plan['full'])
                self.assertEqual(self.ids(plan), set(select_ci.inventory(ROOT, self.config)))

    def test_main_and_manual_runs_always_cover_every_case_in_both_viewports(self):
        found = select_ci.inventory(ROOT, self.config)
        for event in ['push', 'workflow_dispatch']:
            plan = self.plan(['README.md'], event_name=event)
            counts = Counter((name[:3], row['project']) for row in plan['matrix']['include'] for name in row['scenarios'])
            counts.update(('001', project) for project in select_ci.PROJECTS)
            self.assertEqual(counts, Counter({(key, project): 1 for key in found for project in select_ci.PROJECTS}))

    def test_full_label_is_an_explicit_override_and_removal_returns_to_selection(self):
        event = {'pull_request': {'labels': [{'name': 'ci:full-e2e'}]}}
        self.assertTrue(self.plan(['README.md'], event)['full'])
        self.assertFalse(self.plan(['README.md'], {'pull_request': {'labels': []}})['full'])

    def test_unavailable_pr_diff_falls_back_to_full(self):
        plan = select_ci.select(ROOT, self.config, 'pull_request', {})
        self.assertTrue(plan['full'])
        self.assertIn('PR diff unavailable: full suite', plan['reasons'])

    def test_unknown_or_duplicated_test_registration_fails_closed(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for key, name in [('001', 'landing'), ('035', 'routing'), ('999', 'new-feature')]:
                target = root / f'tests/e2e/{key}-{name}/{key}-{name}.spec.ts'
                target.parent.mkdir(parents=True)
                target.touch()
            with self.assertRaisesRegex(ValueError, 'Register new walkthrough'):
                self.plan(root=root)
        broken = json.loads(json.dumps(self.config))
        broken['groups']['another'] = ['035']
        with self.assertRaisesRegex(ValueError, 'multiple groups'):
            select_ci.inventory(ROOT, broken)

    def test_deleting_smoke_or_a_regular_spec_cannot_silently_reduce_coverage(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            for name in ['001-landing', '035-signed-out-routing', '015-import-journal']:
                target = root / f'tests/e2e/{name}/{name}.spec.ts'
                target.parent.mkdir(parents=True)
                target.touch()
            removed = 'tests/e2e/015-import-journal/015-import-journal.spec.ts'
            (root / removed).unlink()
            self.assertTrue(self.plan([removed], root=root)['full'])
            (root / 'tests/e2e/035-signed-out-routing/035-signed-out-routing.spec.ts').unlink()
            with self.assertRaisesRegex(ValueError, 'smoke'):
                self.plan(root=root)

    def test_generic_and_paid_modes_stay_separate_and_commands_are_argument_arrays(self):
        plan = self.plan(event_name='push')
        generic = [row for row in plan['matrix']['include'] if row['mode'] == 'generic']
        self.assertEqual(len(generic), 2)
        self.assertTrue(all(row['scenarios'] == ['009-generic-ai'] for row in generic))
        for row in plan['matrix']['include']:
            command = run_ci_walkthroughs.commands(ROOT, row['project'], row['mode'], row['scenarios'])[-1]
            self.assertEqual(command[:3], ['npx', 'playwright', 'test'])
            self.assertTrue(all((ROOT / path).is_file() for path in command[4:]))
        for project, mode, scenarios in [('desktop-chromium', 'paid', ['009-generic-ai']),
                                          ('desktop-chromium', 'generic', ['035-signed-out-routing']),
                                          ('desktop-chromium; echo injected', 'paid', ['035-signed-out-routing']),
                                          ('desktop-chromium', 'paid', ['../../other.spec.ts']),
                                          ('desktop-chromium', 'paid', [])]:
            with self.assertRaises(ValueError):
                run_ci_walkthroughs.commands(ROOT, project, mode, scenarios)

    def test_publication_gate_rejects_missing_failed_skipped_or_cancelled_checks(self):
        good = {name: {'result': 'success'} for name in ci_gate.REQUIRED}
        self.assertEqual(ci_gate.failures(good), {})
        self.assertTrue(ci_gate.failures({}))
        for name in ci_gate.REQUIRED:
            for result in ['failure', 'skipped', 'cancelled', 'unknown']:
                with self.subTest(name=name, result=result):
                    broken = {**good, name: {'result': result}}
                    self.assertEqual(ci_gate.failures(broken), {name: result})
            broken = {key: value for key, value in good.items() if key != name}
            self.assertEqual(ci_gate.failures(broken), {name: 'missing'})

    def test_real_merge_base_includes_earlier_commits_and_both_sides_of_renames(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(root), *args], text=True).strip()
            git('init', '-q')
            git('config', 'commit.gpgsign', 'false')
            git('config', 'core.hooksPath', '/dev/null')
            git('config', 'user.name', 'CI fixture')
            git('config', 'user.email', 'ci@example.test')
            (root / 'README.md').write_text('base')
            component = root / 'src/lib/components/ImportPanel.svelte'
            component.parent.mkdir(parents=True)
            component.write_text('base')
            git('add', '.')
            git('commit', '-qm', 'base')
            base = git('rev-parse', 'HEAD')
            component.write_text('changed')
            git('commit', '-qam', 'first feature commit')
            (root / 'README.md').write_text('documentation')
            git('commit', '-qam', 'second feature commit')
            head = git('rev-parse', 'HEAD')
            paths = select_ci.changed_paths(root, base, head)
            self.assertEqual(set(paths), {'README.md', 'src/lib/components/ImportPanel.svelte'})
            git('mv', 'src/lib/components/ImportPanel.svelte', 'src/lib/components/Shared.svelte')
            git('commit', '-qm', 'rename')
            paths = select_ci.changed_paths(root, head, git('rev-parse', 'HEAD'))
            self.assertEqual(set(paths), {'src/lib/components/ImportPanel.svelte', 'src/lib/components/Shared.svelte'})
            self.assertTrue(self.plan(paths)['full'])


if __name__ == '__main__':
    unittest.main()

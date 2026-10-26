// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		interface PageState { calendar?: import('./lib/calendar-navigation').CalendarFlow | null }
		// interface Platform {}
	}
}

export {};

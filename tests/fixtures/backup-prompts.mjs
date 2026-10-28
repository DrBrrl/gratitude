import {zipSync,strToU8} from 'fflate';
export function promptWorkbook(count=102,{formula=false}={}) {
  const questions=Array.from({length:count},(_,i)=>`Which fictional everyday sound number ${i+1} brought you joy?`);
  const rows=['Prompt',...questions].map((text,i)=>`<row r="${i+1}"><c r="A${i+1}" t="inlineStr">${formula&&i===1?'<f>HYPERLINK("https://example.invalid")</f>':''}<is><t>${text}</t></is></c></row>`).join('');
  return {questions,bytes:zipSync({
    '[Content_Types].xml':strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'),
    'xl/workbook.xml':strToU8('<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Prompts" sheetId="1"/></sheets></workbook>'),
    'xl/worksheets/sheet1.xml':strToU8(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rows}</sheetData></worksheet>`)
  })};
}

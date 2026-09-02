import type { AuditSnapshot, AuditTrailRow } from "../audit-report.ts";

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i]!;
    for (let j = 0; j < 8; j += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }
  return crc ^ 0xffffffff;
}

function u16(n: number) {
  const b = new Uint8Array(2);
  new DataView(b.buffer).setUint16(0, n >>> 0, true);
  return b;
}

function u32(n: number) {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n >>> 0, true);
  return b;
}

function concat(parts: Uint8Array[]) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Store-only ZIP (no compression) so we can emit .xlsx without extra deps. */
export function zipStore(files: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const file of files) {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const local = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(crc),
      u32(file.data.length),
      u32(file.data.length),
      u16(name.length),
      u16(0),
      name,
      file.data,
    ]);
    locals.push(local);
    centrals.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(crc),
        u32(file.data.length),
        u32(file.data.length),
        u16(name.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        name,
      ]),
    );
    offset += local.length;
  }
  const central = concat(centrals);
  const end = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(central.length),
    u32(offset),
    u16(0),
  ]);
  return concat([...locals, central, end]);
}

function xmlEscape(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function cell(value: string) {
  return `<c t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function formatAmount(n: number | null) {
  if (n === null || !Number.isFinite(n)) return "—";
  return `$${n.toFixed(2)}`;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

const HEADERS = ["Time", "Kind", "Chain", "To", "Amount", "Result", "Detail"] as const;

function rowValues(row: AuditTrailRow): string[] {
  return [
    formatTime(row.timestamp),
    row.kind,
    row.chain,
    row.to,
    formatAmount(row.amountUsd),
    row.result,
    row.detail,
  ];
}

export function buildXlsx(snapshot: AuditSnapshot): Uint8Array {
  const encoder = new TextEncoder();
  const sheetRows = [
    `<row r="1">${HEADERS.map((h) => cell(h)).join("")}</row>`,
    ...snapshot.rows.map(
      (row, i) =>
        `<row r="${i + 2}">${rowValues(row)
          .map((v) => cell(v))
          .join("")}</row>`,
    ),
  ];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${sheetRows.join("")}</sheetData>
</worksheet>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets><sheet name="Audit trail" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
</Types>`;
  const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;
  return zipStore([
    { name: "[Content_Types].xml", data: encoder.encode(contentTypes) },
    { name: "_rels/.rels", data: encoder.encode(rels) },
    { name: "xl/workbook.xml", data: encoder.encode(workbook) },
    { name: "xl/_rels/workbook.xml.rels", data: encoder.encode(wbRels) },
    { name: "xl/worksheets/sheet1.xml", data: encoder.encode(sheet) },
  ]);
}

export function xlsxLooksValid(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function pdfEscape(s: string) {
  return s.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function ascii(s: string) {
  return s.replace(/[^\x20-\x7e]/g, "?");
}

function wrap(s: string, width: number) {
  const out: string[] = [];
  let rest = s;
  while (rest.length > width) {
    out.push(rest.slice(0, width));
    rest = rest.slice(width);
  }
  if (rest) out.push(rest);
  return out.length ? out : [""];
}

export function buildPdf(snapshot: AuditSnapshot): Uint8Array {
  const pageWidth = 792;
  const pageHeight = 612;
  const margin = 36;
  const lineH = 12;
  const header = `${snapshot.agent.name} · ${snapshot.agent.chain} · ${snapshot.agent.address}`;
  const title = "Agent Control audit trail";
  const pages: string[] = [];
  let y = pageHeight - margin;
  let content = "";

  const pushPage = () => {
    pages.push(content);
    content = "";
    y = pageHeight - margin;
  };

  const write = (x: number, text: string, size = 9) => {
    if (y < margin + lineH) pushPage();
    content += `BT /F1 ${size} Tf ${x} ${y} Td (${pdfEscape(ascii(text))}) Tj ET\n`;
    y -= lineH;
  };

  write(margin, title, 14);
  write(margin, header, 9);
  write(margin, `Generated ${formatTime(snapshot.generatedAt)}`, 8);
  write(margin, snapshot.disclaimer, 8);
  y -= 4;
  write(
    margin,
    "Time                 Kind      Chain     To                      Amount     Result",
    8,
  );
  y -= 2;
  for (const row of snapshot.rows) {
    const line = [
      formatTime(row.timestamp).padEnd(21).slice(0, 21),
      row.kind.padEnd(10).slice(0, 10),
      row.chain.padEnd(10).slice(0, 10),
      row.to.padEnd(24).slice(0, 24),
      formatAmount(row.amountUsd).padStart(10).slice(0, 10),
      row.result,
    ].join(" ");
    write(margin, line, 8);
    if (row.detail && row.detail !== row.result) {
      for (const part of wrap(`  ${row.detail}`, 110)) write(margin, part, 8);
    }
  }
  if (!snapshot.rows.length) write(margin, "No Agent Control history for this agent yet.", 9);
  pushPage();

  const objects: string[] = [];
  objects.push("<< /Type /Catalog /Pages 2 0 R >>");
  const pageIds: number[] = [];
  const fontId = 3;
  objects.push("placeholder-pages");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const contentIds: number[] = [];
  for (const pageContent of pages) {
    const stream = pageContent;
    const id = objects.length + 1;
    contentIds.push(id);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}endstream`);
  }
  for (let i = 0; i < pages.length; i += 1) {
    const id = objects.length + 1;
    pageIds.push(id);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentIds[i]} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
    );
  }
  objects[1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefAt = body.length;
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

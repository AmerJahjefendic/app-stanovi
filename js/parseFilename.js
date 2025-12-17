const MONTHS = {
  januar: 1, februar: 2, mart: 3, april: 4, maj: 5, juni: 6, jul: 7, august: 8,
  septembar: 9, oktobar: 10, novembar: 11, decembar: 12
};

function normalize(s) {
  return String(s)
    .trim()
    .toLowerCase()
    .replaceAll("š", "s")
    .replaceAll("đ", "d")
    .replaceAll("č", "c")
    .replaceAll("ć", "c")
    .replaceAll("ž", "z");
}

export function parsePeriodFromFilename(filename) {
  // "Troškovnik Septembar 2025.xlsx"
  const name = filename.replace(".xlsx", "").trim();

  // tolerantno na diakritiku u "Troškovnik"
  const re = /^Troskovnik\s+([A-Za-zČĆĐŠŽčćđšž]+)\s+(\d{4})/;
  const re2 = /^Troškovnik\s+([A-Za-zČĆĐŠŽčćđšž]+)\s+(\d{4})/;

  const m = name.match(re) || name.match(re2);
  if (!m) return null;

  const monthName = normalize(m[1]);
  const year = Number(m[2]);
  const month = MONTHS[monthName];
  if (!month || !year) return null;

  return { month, year };
}

export function periodLabel({ month, year }) {
  const inv = Object.entries(MONTHS).find(([, v]) => v === month)?.[0] || String(month);
  const pretty = inv.charAt(0).toUpperCase() + inv.slice(1);
  return `${pretty} ${year}`;
}

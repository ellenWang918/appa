import fs from "node:fs";
import path from "node:path";
import Holidays from "date-holidays";

const root = process.cwd();
const data = JSON.parse(
  fs.readFileSync(
    path.join(root, "node_modules/date-holidays/data/holidays.json"),
    "utf8",
  ),
);
const source = new Holidays();
const catalog = {};
const zones = {};
for (const [country, label] of Object.entries(source.getCountries("en"))) {
  const definition = data.holidays[country];
  catalog[country] = { country, label };
  for (const zone of definition.zones ?? []) zones[zone] = country;
  const regionalZones = new Map();
  for (const [state, stateLabel] of Object.entries(
    source.getStates(country, "en") ?? {},
  )) {
    const id = `${country}.${state}`;
    catalog[id] = { country, state, label: `${label} · ${stateLabel}` };
    for (const zone of definition.states?.[state]?.zones ?? []) {
      const locations = regionalZones.get(zone) ?? [];
      locations.push(id);
      regionalZones.set(zone, locations);
    }
    for (const [region, regionLabel] of Object.entries(
      source.getRegions(country, state, "en") ?? {},
    ))
      catalog[`${id}.${region}`] = {
        country,
        state,
        region,
        label: `${label} · ${stateLabel} · ${regionLabel}`,
      };
  }
  for (const [zone, locations] of regionalZones)
    if (locations.length === 1) zones[zone] = locations[0];
}
Object.assign(zones, {
  "Australia/Brisbane": "AU.QLD",
  "Australia/Lindeman": "AU.QLD",
  "Australia/Sydney": "AU.NSW",
  "Australia/Canberra": "AU.ACT",
  "Australia/Melbourne": "AU.VIC",
  "Australia/Hobart": "AU.TAS",
  "Australia/Currie": "AU.TAS",
  "Australia/Adelaide": "AU.SA",
  "Australia/Broken_Hill": "AU.NSW",
  "Australia/Darwin": "AU.NT",
  "Australia/Perth": "AU.WA",
  "Australia/Eucla": "AU.WA",
});
fs.writeFileSync(
  path.join(root, "src/holidayCatalog.ts"),
  "// Generated from date-holidays 3.37.0 by scripts/generate-holiday-catalog.mjs.\n" +
    "// Holiday data attribution and licenses: third-party/holiday-calendars/.\n" +
    'import type { HolidayLocation } from "./types.js";\n' +
    `export const HOLIDAY_CALENDARS: Readonly<Record<string, HolidayLocation>> = ${JSON.stringify(catalog, null, 2)};\n` +
    `export const TIMEZONE_CALENDARS: Readonly<Record<string, string>> = ${JSON.stringify(zones, null, 2)};\n`,
);

const visited = new Set();
function copyLicenses(name) {
  if (visited.has(name)) return;
  visited.add(name);
  const directory = path.join(root, "node_modules", name);
  const info = JSON.parse(
    fs.readFileSync(path.join(directory, "package.json"), "utf8"),
  );
  const destination = path.join(
    root,
    "third-party/holiday-calendars",
    name.replaceAll("/", "-"),
  );
  fs.mkdirSync(destination, { recursive: true });
  for (const file of fs.readdirSync(directory))
    if (
      /^(license|copying|notice)(\.|$)/i.test(file) &&
      fs.statSync(path.join(directory, file)).isFile()
    )
      fs.copyFileSync(path.join(directory, file), path.join(destination, file));
  fs.writeFileSync(
    path.join(destination, "package-notice.txt"),
    `${name} ${info.version}\nLicense: ${info.license}\n` +
      (info.homepage ? `${info.homepage}\n` : ""),
  );
  for (const dependency of Object.keys(info.dependencies ?? {}))
    copyLicenses(dependency);
}
copyLicenses("date-holidays");
console.log(
  `Generated ${Object.keys(catalog).length} calendars and ${Object.keys(zones).length} timezone defaults; copied ${visited.size} dependency notices.`,
);

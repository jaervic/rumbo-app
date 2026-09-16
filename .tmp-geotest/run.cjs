// Script temporal de validación de lib/geocoding.ts (se elimina después).
const path = require("path");

const moduleExports = require(path.join(__dirname, "geocoding.js"));
const { autocompleteAddress, MIN_QUERY_LENGTH, MAX_SUGGESTION_LIMIT } = moduleExports;
const now = () => Date.now();

const QUERIES = [
  "sambil",
  "sambil chacao",
  "sambil valencia",
  "chaca",
  "altam",
  "merida",
  "cc",
];

(async () => {
  console.log("EXPORTS=" + Object.keys(moduleExports).sort().join(","));
  console.log("CONSTS min=" + MIN_QUERY_LENGTH + " max=" + MAX_SUGGESTION_LIMIT);

  for (const query of QUERIES) {
    const t0 = now();
    const list = await autocompleteAddress(query);
    console.log(
      "\n# " + JSON.stringify(query) + " -> " + list.length + " (" + (now() - t0) + "ms)"
    );
    list.forEach((item, index) => {
      console.log(
        "   " +
          (index + 1) +
          ". " +
          item.shortName +
          "  ||  " +
          item.secondaryText +
          "  | osm=" +
          item.osmValue
      );
    });
  }

  const t1 = now();
  await autocompleteAddress("sambil");
  console.log("\nCACHE_MS=" + (now() - t1));

  const a0 = now();
  await autocompleteAddress("maracaibo");
  const a1 = now();
  await autocompleteAddress("valencia");
  const a2 = now();
  console.log("RATE_FIRST_MS=" + (a1 - a0) + " RATE_SECOND_MS=" + (a2 - a1));
})().catch((error) => {
  console.error("FAIL", error);
  process.exit(1);
});

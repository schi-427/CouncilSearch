const fs = require("fs/promises");
const cheerio = require("cheerio");

const PAGE_URL =
  "https://www.conwaysc.gov/departments/administration_new/agendas___minutes.php";

async function main() {
  const response = await fetch(PAGE_URL);

  if (!response.ok) {
    throw new Error(`Failed to fetch page: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const documents = [];

  $("a").each((_, element) => {
    const text = $(element).text().trim();
    const href = $(element).attr("href");

    if (!href) return;
    if (!href.toLowerCase().includes(".pdf")) return;

    const absoluteUrl = new URL(href, PAGE_URL).href;

    documents.push({
      title: text || absoluteUrl.split("/").pop(),
      url: absoluteUrl
    });
  });

  await fs.mkdir("public", { recursive: true });

  await fs.writeFile(
    "public/documents.json",
    JSON.stringify(documents, null, 2)
  );

  console.log(`Saved ${documents.length} document links.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
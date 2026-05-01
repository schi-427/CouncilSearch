const fs = require("fs/promises");
const cheerio = require("cheerio");

const PAGE_URL =
    "https://www.conwaysc.gov/departments/administration_new/agendas___minutes.php";
const PDF_BASE_URL = "https://cms1files.revize.com/conway/";

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

        const absoluteUrl = new URL(href.split("/").pop(), PDF_BASE_URL).href;
        const fileName = decodeURIComponent(
            absoluteUrl.split("/").pop().split("?")[0]
        ).toUpperCase();
        documents.push({
            title: fileName.replace(".PDF", ""),
            url: absoluteUrl,
            commission: getCommission(fileName),
            documentType: getDocumentType(fileName)
        });
    });

    await fs.mkdir("public", { recursive: true });

    await fs.writeFile(
        "public/documents.json",
        JSON.stringify(documents, null, 2)
    );

    console.log(`Saved ${documents.length} document links.`);
}
function getCommission(fileName) {
    if (fileName.includes("CAB")) return "Community Appearance Board";
    if (fileName.includes("BZA")) return "Board of Zoning Appeals";
    if (fileName.includes("PC")) return "Planning Commission";
    if (fileName.includes("KCB")) return "Keep Conway Beautiful";
    if (fileName.includes("TREE")) return "Tree Board";
    if (fileName.includes("WATER QUALITY")) return "Water Quality & Drainage Commission";
    if (fileName.includes("COUNCIL")) return "City Council";

    return "Unknown";
}
function getDocumentType(fileName) {
    const name = fileName.toUpperCase();

    if (name.includes("AGENDA")) return "Agenda";
    if (name.includes("PACKET")) return "Packet";
    if (name.includes("MINUTES")) return "Minutes";

    return "Other";
}
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
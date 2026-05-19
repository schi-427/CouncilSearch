const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const INPUT_FILE = "public/documents.json";
const OUTPUT_FILE = "public/search-index.json";
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

function isYoutubeUrl(url) {
    const lower = (url || "").toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
}






function extractDateFromTitle(title) {
  if (!title) return null;

  // 1. Try numeric formats first (e.g., 3.26.26 or 03/26/2026)
  const numericMatch = title.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);

  if (numericMatch) {
    let [, month, day, year] = numericMatch;

    if (year.length === 2) {
      year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }

    const date = new Date(Number(year), Number(month) - 1, Number(day));

    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().slice(0, 10);
    }
  }

  // 2. Try "Month YYYY" format (e.g., February 2026)
  const monthMatch = title.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i
  );

  if (monthMatch) {
    const [, monthName, year] = monthMatch;

    const monthMap = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11
    };

    const monthIndex = monthMap[monthName.toLowerCase()];

    if (monthIndex !== undefined) {
      const date = new Date(Number(year), monthIndex, 1);
      return date.toISOString().slice(0, 10);
    }
  }

  return null;
}
async function main() {
    const raw = await fs.readFile(INPUT_FILE, "utf8");
    const documents = JSON.parse(raw);
    const pdfDocuments = documents.filter((doc) => !isYoutubeUrl(doc.url));

    const skippedVideos = documents.length - pdfDocuments.length;
    if (skippedVideos > 0) {
        console.log(`Skipping ${skippedVideos} YouTube link(s).`);
    }

    const searchIndex = [];

    for (const [index, doc] of pdfDocuments.entries()) {
        console.log(`Processing ${index + 1}/${pdfDocuments.length}: ${doc.title}`);

        try {
            const pdfBuffer = await downloadPdfBuffer(doc.url);

            let text = await extractTextFromPdfBuffer(pdfBuffer);
            let textSource = "embedded";

            if (!isUsefulText(text)) {
                console.log(`Running OCR for ${doc.title}`);
                text = await extractTextWithOcr(pdfBuffer, doc.title);
                textSource = "ocr";
            }

            searchIndex.push({
                title: doc.title,
                url: doc.url,
                commission: doc.commission,
                documentType: doc.documentType,
                date: extractDateFromTitle(doc.title),
                text,
                textSource
            });
        } catch (error) {
            console.error(`Skipping ${doc.title}`);
            console.error(error.message);

            searchIndex.push({
                title: doc.title,
                url: doc.url,
                commission: doc.commission,
                documentType: doc.documentType,
                text: "",
                error: error.message
            });
        }
    }

    await fs.writeFile(
        OUTPUT_FILE,
        JSON.stringify(searchIndex, null, 2)
    );

    console.log(
        `Saved ${searchIndex.length} PDF records to ${OUTPUT_FILE} (${skippedVideos} video(s) omitted).`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
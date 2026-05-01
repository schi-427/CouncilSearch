const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const INPUT_FILE = "public/documents.json";
const OUTPUT_FILE = "public/search-index.json";
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function downloadPdfBuffer(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.status} ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function extractTextFromPdfBuffer(buffer) {
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    return result.text.replace(/\s+/g, " ").trim();
}

async function extractTextWithOcr(buffer, title) {
    const safeTitle = title.replace(/[^a-z0-9]/gi, "_").toLowerCase();
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `${safeTitle}_`));

    const pdfPath = path.join(tempDir, "document.pdf");
    const imagePrefix = path.join(tempDir, "page");

    await fs.writeFile(pdfPath, buffer);

    // Convert PDF pages to PNG images
    await execFileAsync("pdftoppm", [
        "-png",
        "-r",
        "200",
        pdfPath,
        imagePrefix
    ]);

    const files = await fs.readdir(tempDir);
    const imageFiles = files
        .filter(file => file.endsWith(".png"))
        .sort();

    const pageTexts = [];

    for (const imageFile of imageFiles) {
        const imagePath = path.join(tempDir, imageFile);

        const { stdout } = await execFileAsync("tesseract", [
            imagePath,
            "stdout",
            "-l",
            "eng"
        ]);

        pageTexts.push(stdout.trim());
    }

    await fs.rm(tempDir, { recursive: true, force: true });

    return pageTexts
        .join("\n\n")
        .replace(/\s+/g, " ")
        .trim();
}
function isUsefulText(text) {
    if (!text) return false;

    const cleaned = text.replace(/\s+/g, " ").trim();

    if (cleaned.length < 100) return false;

    // catches: -- 1 of 5 -- -- 2 of 5 --
    const withoutPageMarkers = cleaned
        .replace(/--\s*\d+\s+of\s+\d+\s*--/gi, "")
        .trim();

    if (withoutPageMarkers.length < 100) return false;

    return true;
}
function extractDateFromTitle(title) {
    const match = title.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);

    if (!match) return null;

    let [, month, day, year] = match;

    if (year.length === 2) {
        year = Number(year) >= 70 ? `19${year}` : `20${year}`;
    }

    const date = new Date(Number(year), Number(month) - 1, Number(day));

    if (Number.isNaN(date.getTime())) return null;

    return date.toISOString().slice(0, 10);
}
async function main() {
    const raw = await fs.readFile(INPUT_FILE, "utf8");
    const documents = JSON.parse(raw);

    const searchIndex = [];

    for (const [index, doc] of documents.entries()) {
        console.log(`Processing ${index + 1}/${documents.length}: ${doc.title}`);

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

    console.log(`Saved ${searchIndex.length} records to ${OUTPUT_FILE}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
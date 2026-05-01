const fs = require("fs/promises");
const { PDFParse } = require("pdf-parse");
const INPUT_FILE = "public/documents.json";
const OUTPUT_FILE = "public/search-index.json";

async function extractTextFromPdf(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to download PDF: ${response.status} ${url}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();

    return result.text.replace(/\s+/g, " ").trim();
}

async function main() {
    const raw = await fs.readFile(INPUT_FILE, "utf8");
    const documents = JSON.parse(raw);

    const searchIndex = [];

    for (const [index, doc] of documents.entries()) {
        console.log(`Processing ${index + 1}/${documents.length}: ${doc.title}`);

        try {
            const text = await extractTextFromPdf(doc.url);

            searchIndex.push({
                title: doc.title,
                url: doc.url,
                commission: doc.commission,
                documentType: doc.documentType,
                text
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
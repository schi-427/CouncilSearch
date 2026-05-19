const fs = require("fs/promises");
const cheerio = require("cheerio");

const PAGE_URL =
    "https://www.conwaysc.gov/departments/administration_new/agendas___minutes.php";
const DOCUMENTS_FILE = "public/documents.json";

function isYoutubeUrl(url) {
    const lower = url.toLowerCase();
    return lower.includes("youtube.com") || lower.includes("youtu.be");
}

function youtubeVideoId(url) {
    try {
        const parsed = new URL(url);
        if (parsed.hostname.includes("youtu.be")) {
            return parsed.pathname.replace(/^\//, "").split("/")[0];
        }
        if (parsed.pathname.startsWith("/live/")) {
            return parsed.pathname.split("/")[2];
        }
        return parsed.searchParams.get("v");
    } catch {
        return null;
    }
}

function normalizeYoutubeUrl(url) {
    const id = youtubeVideoId(url);
    return id ? `https://www.youtube.com/watch?v=${id}` : url;
}

async function fetchVideoTitle(url) {
    const response = await fetch(
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
    );

    if (!response.ok) {
        throw new Error(`oEmbed failed for ${url}: ${response.status}`);
    }

    const data = await response.json();
    return data.title;
}

function getCommission(title) {
    const name = title.toUpperCase();

    if (name.includes("COMMUNITY APPEARANCE") || name.includes("CAB")) {
        return "Community Appearance Board";
    }
    if (name.includes("ZONING APPEALS") || name.includes("BZA")) {
        return "Board of Zoning Appeals";
    }
    if (name.includes("PLANNING COMMISSION") || name.includes(" PLAN COMM")) {
        return "Planning Commission";
    }
    if (name.includes("KEEP CONWAY BEAUTIFUL") || name.includes("KCB")) {
        return "Keep Conway Beautiful";
    }
    if (name.includes("TREE BOARD") || name.includes("TREE")) {
        return "Tree Board";
    }
    if (name.includes("WATER QUALITY") || name.includes("DRAINAGE")) {
        return "Water Quality & Drainage Commission";
    }
    if (name.includes("COUNCIL")) return "City Council";

    return "Unknown";
}

async function scrapeYoutubeLinks() {
    const response = await fetch(PAGE_URL);

    if (!response.ok) {
        throw new Error(`Failed to fetch page: ${response.status}`);
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const seenIds = new Set();
    const links = [];

    $("a").each((_, element) => {
        const href = $(element).attr("href");
        if (!href || !isYoutubeUrl(href)) return;

        const url = normalizeYoutubeUrl(href);
        const id = youtubeVideoId(url);
        if (!id || seenIds.has(id)) return;

        seenIds.add(id);
        links.push(url);
    });

    const videos = [];

    for (const url of links) {
        const title = await fetchVideoTitle(url);
        videos.push({
            title,
            url,
            commission: getCommission(title),
            documentType: "Video"
        });
    }

    return videos;
}

async function loadExistingDocuments() {
    try {
        const raw = await fs.readFile(DOCUMENTS_FILE, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
    }
}

async function main() {
    // Run after scripts/scrape-doc-links.js — that script replaces documents.json
    // with PDFs only. This script reads that file, keeps every non-YouTube entry,
    // refreshes YouTube entries, and writes the combined list back.
    const existing = await loadExistingDocuments();
    const videos = await scrapeYoutubeLinks();

    const nonVideos = existing.filter((doc) => !isYoutubeUrl(doc.url));
    const documents = [...nonVideos, ...videos];

    await fs.mkdir("public", { recursive: true });
    await fs.writeFile(DOCUMENTS_FILE, JSON.stringify(documents, null, 2));

    console.log(
        `Wrote ${documents.length} total documents (${nonVideos.length} kept from existing file, ${videos.length} videos).`
    );
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});

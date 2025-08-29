import * as fs from 'fs-extra';
const axios = require('axios');
import * as dotenv from 'dotenv';
import prompts = require("prompts");
import * as path from 'path';

dotenv.config({ path: '../../.env' });

const MANGA_COVERS_PATH = "../Attachments/manga_covers";
const MANGA_PATH = "../Manga";

// Interface for manga data
interface MangaInfo {
    title: string;
    slug: string;
    year?: string;
    genres?: Array<string>;
    themes?: Array<string>;
    summary?: string;
}

// Fetch manga data from Mangadex API by ID
async function fetchMangaById(id: string): Promise<MangaInfo | null> {
    try {
        const response = await axios.get(`https://api.mangadex.org/manga/${id}`);

        // Extract manga data
        const manga_fetched = response.data.data;

        const confirm = await prompts({
            type: "confirm",
            name: "value",
            message: `Do you want to add "${manga_fetched.attributes.title.en}" to the database? (Y/n)`,
            initial: true,
        });

        if (!confirm.value) {
            process.exit(0);
        }

        const manga_info: MangaInfo = {
            title: manga_fetched.attributes.title.en,
            slug: manga_fetched.attributes.title.en
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
            year: manga_fetched.attributes.year ?? "",
            genres: (manga_fetched.attributes.tags
                ?.filter((tag: any) => tag.attributes.group === "genre") ?? [])
                .map((tag: any) => tag.attributes.name.en),
            themes: (manga_fetched.attributes.tags
                ?.filter((tag: any) => tag.attributes.group === "theme") ?? [])
                .map((tag: any) => tag.attributes.name.en),
            summary: manga_fetched.attributes.description.en ?? "No summary available.",
        };

        const cover_url = await fetchCoverById(id);
        if (cover_url) {
            await downloadImage(cover_url, `${manga_info.slug}.jpg`);
        } else {
            console.log("No cover available for this manga.");
        }

        return manga_info;
    } catch (error: any) {
        console.error("Error fetching manga data:", error);
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error(`API Error: ${error.response.status} - ${error.response.statusText}`);
                if (error.response.status === 404) {
                    console.error("Manga not found with the provided ID.");
                } else if (error.response.status === 429) {
                    console.error("Rate limit exceeded. Please try again later.");
                }
            } else if (error.request) {
                console.error("Network error: Unable to connect to MangaDex API");
            } else {
                console.error("Unexpected error:", error.message);
            }
        }
        return null;
    }
}

// Fetch cover data from Mangadex API by ID
async function fetchCoverById(id: string): Promise<string | null> {
    try {
        const response = await axios.get(`https://api.mangadex.org/cover?manga[]=${id}`);
        const covers = response.data.data;

        if (!covers || covers.length === 0) return null;

        const cover_url = `https://uploads.mangadex.org/covers/${id}/${covers[0].attributes.fileName}`;
        return cover_url;
    } catch (error: any) {
        console.error("Error fetching cover data:", error);
        return null;
    }
}

// Download manga cover
async function downloadImage(url: string, filename: string) {
    try {
        // Treat the image as binary data
        const response = await axios.get(url, { responseType: "arraybuffer" })

        // Ensure the directory exists else create it
        const dir = path.join(process.cwd(), MANGA_COVERS_PATH);
        await fs.ensureDir(dir);

        // Define the file path
        const file_path = path.join(dir, filename);

        // Write the image data to the file
        await fs.writeFile(file_path, response.data);

        console.log(`Image saved to ${file_path}`);
    } catch (error) {
        console.error("Error downloading image:", error);
    }
}

// Generate markdown file
function generateMarkdown(manga_info: MangaInfo, isManga: boolean): string {
    return `---
title: "${manga_info.title}"
rating:
year: "${manga_info.year}"
tags:
    - ${isManga ? "manga" : "manhwa"}
    ${manga_info.genres?.map((genre: string) => `- ${genre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`)
            .join("\n    ")}
    ${manga_info.themes?.map((theme: string) => `- ${theme
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")}`)
            .join("\n    ")}
    - wishlist
cover: "[[${manga_info.slug}.jpg]]"
---
> [!NOTE] Summary
${manga_info.summary?.split("\n").map(line => `> ${line}`).join("\n")}`;
}

// Create markdown file
async function createMarkdownFile(content: string, filename: string): Promise<string | null> {
    try {
        const dir = path.join(process.cwd(), MANGA_PATH);
        await fs.ensureDir(dir);

        const file_path = path.join(dir, filename);
        await fs.writeFile(file_path, content, "utf-8");

        console.log(`Markdown file created at ${file_path}`);
        return file_path;
    } catch (error) {
        console.error("Error creating Markdown file:", error);
        return null;
    }
}

async function main() {
    const response = await prompts({
        type: "text",
        name: "mangaId",
        message: "Please enter a MangaDex ID:"
    });

    const mangaId: string = response.mangaId;

    const isManga = await prompts({
        type: "confirm",
        name: "value",
        message: `Is this a manga? (Y/n)`,
        initial: true,
    });

    const mangaInfo = await fetchMangaById(mangaId);
    if (mangaInfo) {
        console.log("Manga fetched successfully.");
        console.log("Generating Markdown file...");

        const markdown_content = generateMarkdown(mangaInfo, isManga.value);
        console.log("Markdown content generated successfully.");
        console.log("Creating Markdown file...");

        const file_path = await createMarkdownFile(markdown_content, `${mangaInfo.slug}.md`);
        if (file_path) {
            console.log("Markdown file created successfully.");
        }
        else {
            console.error("Error creating Markdown file.");
        }
        console.log("Done.");
    }
    else {
        console.error("Error fetching manga data or an error occurred.");
    }
}

(async () => await main())();
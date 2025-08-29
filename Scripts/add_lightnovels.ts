import * as fs from 'fs-extra';
const axios = require('axios');
import prompts = require("prompts");
import * as path from 'path';

const LN_COVERS_PATH = "../Attachments/ln_covers";
const LN_PATH = "../Light_Novels";

interface LightNovelInfo {
    title: string;
    slug: string;
    year?: string;
    genres?: Array<string>;
    themes?: Array<string>;
    summary?: string;
}

async function fetchLightNovelById(id: number): Promise<LightNovelInfo | null> {
    try {
        const response = await axios.get(`https://ranobedb.org/api/v0/series/${id}`);

        // Extract light novel data
        const ln_fetched = response.data;

        const confirm = await prompts({
            type: "confirm",
            name: "value",
            message: `Do you want to add "${ln_fetched.series.title}" to the database? (Y/n)`,
            initial: true,
        });

        if (!confirm.value) {
            process.exit(0);
        }

        const startDateStr = ln_fetched.series.start_date.toString();

        const ln_info: LightNovelInfo = {
            title: ln_fetched.series.title,
            slug: ln_fetched.series.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),

            year: ln_fetched.series.start_date ? startDateStr.slice(0, 4) : "",
            genres: ln_fetched.series.tags?.filter((tag: any) => tag.ttype === "genre").map((tag: any) => tag.name) ?? [],
            themes: ln_fetched.series.tags?.filter((tag: any) => tag.ttype === "tag").map((tag: any) => tag.name) ?? [],
            summary: ln_fetched.series.book_description.description ?? ""
        };

        const cover_url = getCoverUrl(ln_fetched);
        if (cover_url) {
            await downloadImage(cover_url, `${ln_info.slug}.jpg`);
        } else {
            console.error(`Error fetching cover data for ${ln_info.title}`);
        }

        return ln_info;
    } catch (error: any) {
        console.error("Error fetching light novel data:", error);
        if (axios.isAxiosError(error)) {
            if (error.response) {
                console.error("Error status code:", error.response.status);
                console.error("Error response data:", error.response.data);
            }
            else if (error.request) {
                console.error("Error request data:", error.request);
            }
            else {
                console.error("Unexpected error:", error.message);
            }
        }
        return null;
    }
}

// Get cover url
function getCoverUrl(ln_fetched: any): string | null {
    // Get the main book with an image and sort by sort order asc to get the first one
    const mainBook = ln_fetched.series.books
        ?.filter((b: any) => b.book_type === "main" && b.image)
        .sort((a: any, b: any) => a.sort_order - b.sort_order)[0];

    if (!mainBook || !mainBook.image) return null;

    return `https://images.ranobedb.org/${mainBook.image.filename}`;
}

// Download light novel cover
async function downloadImage(url: string, filename: string) {
    try {
        // Treat the image as binary data
        const response = await axios.get(url, { responseType: "arraybuffer" })

        // Ensure the directory exists else create it
        const dir = path.join(process.cwd(), LN_COVERS_PATH);
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
function generateMarkdown(ln_info: LightNovelInfo): string {
    return `---
title: "${ln_info.title}"
rating:
year: "${ln_info.year}"
tags:
    - lightnovel
    ${ln_info.genres?.map((genre: string) => `- ${genre
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`)
            .join("\n    ")}
    ${ln_info.themes?.map((theme: string) => `- ${theme
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, "")}`)
            .join("\n    ")}
    - wishlist
cover: "[[${ln_info.slug}.jpg]]"
---
> [!NOTE] Summary
${ln_info.summary?.split("\n").map(line => `> ${line}`).join("\n")}`;
}

// Create markdown file
async function createMarkdownFile(content: string, filename: string): Promise<string | null> {
    try {
        const dir = path.join(process.cwd(), LN_PATH);
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
        name: "lnId",
        message: "Please enter a RanobeDB ID:",
        validate: (value: string) => {
            const n = Number(value);
            if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
                return "RanobeDB ID must be a positive integer";
            }
            return true;
        }
    });

    const lnId: number = response.lnId;

    const ln_info = await fetchLightNovelById(lnId);
    if (ln_info) {
        console.log("Light novel fetched successfully.");
        console.log("Generating Markdown file...");

        const markdown_content = generateMarkdown(ln_info);
        console.log("Markdown content generated successfully.");
        console.log("Creating Markdown file...");

        const file_path = await createMarkdownFile(markdown_content, `${ln_info.slug}.md`);
        if (file_path) {
            console.log("Markdown file created successfully.");
        }
        else {
            console.error("Error creating Markdown file.");
        }
    }
    else {
        console.error("Light novel not found.");
    }
}

(async () => await main())();
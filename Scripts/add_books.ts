import * as fs from 'fs-extra';
const axios = require('axios');
import prompts = require("prompts");
import * as path from 'path';

const BOOK_COVERS_PATH = "../Attachments/book_covers";
const BOOK_PATH = "../Library/Books";

// Interface for book data
interface BookInfo {
    title: string;
    slug: string;
    year?: string;
    categories?: Array<string>;
    summary?: string;
}

// Fetch book data from Google Books API by ISBN
async function fetchBookByIsbn(isbn: string): Promise<BookInfo | null> {
    try {
        const response = await axios.get(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);

        const book_fetched = response.data.items[0].volumeInfo;

        const confirm = await prompts({
            type: "confirm",
            name: "value",
            message: `Do you want to add "${book_fetched.title}" to the database? (Y/n)`,
            initial: true,
        });

        if (!confirm.value) {
            process.exit(0);
        }

        const book_info: BookInfo = {
            title: book_fetched.title,
            slug: book_fetched.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
            year: getYear(book_fetched.publishedDate) ?? "",
            categories: book_fetched.categories ?? [],
            summary: book_fetched.description ?? "No summary available"
        };

        const cover_url = getCoverUrl(book_fetched.imageLinks);
        if (cover_url) {
            await downloadImage(cover_url, `${book_info.slug}.jpg`);
        } else {
            console.log("No cover image found for this book.");
        }
        return book_info;
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

// Get year from published date
function getYear(publishedDate?: string): string {
    if (!publishedDate) return "";
    return publishedDate.slice(0, 4);
}

// Get cover url from image links object
function getCoverUrl(imageLinks?: any): string {
    if (!imageLinks) return "";
    return (
        imageLinks.extraLarge ||
        imageLinks.large ||
        imageLinks.medium ||
        imageLinks.thumbnail ||
        imageLinks.smallThumbnail
    );
}

// Download book cover
async function downloadImage(url: string, filename: string) {
    try {
        // Treat the image as binary data
        const response = await axios.get(url, { responseType: "arraybuffer" })

        // Ensure the directory exists else create it
        const dir = path.join(process.cwd(), BOOK_COVERS_PATH);
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
function generateMarkdown(book_info: BookInfo): string {
    return `---
title: "${book_info.title}"
rating:
year: "${book_info.year}"
tags:
    - book
    ${book_info.categories?.map((category: string) => `- ${category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`)
            .join("\n    ")}
    - wishlist
cover: "[[${book_info.slug}.jpg]]"
---
> [!NOTE] Summary
${book_info.summary?.split("\n").map(line => `> ${line}`).join("\n")}`;
}

// Create markdown file
async function createMarkdownFile(content: string, filename: string): Promise<string | null> {
    try {
        const dir = path.join(process.cwd(), BOOK_PATH);
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
        name: "isbn",
        message: "Please enter an ISBN-13:"
    });

    const isbn: string = response.isbn;

    const bookInfo = await fetchBookByIsbn(isbn);
    if (bookInfo) {
        console.log("Book fetched successfully.");
        console.log("Generating Markdown file...");

        const markdown_content = generateMarkdown(bookInfo);
        console.log("Markdown content generated successfully.");
        console.log("Creating Markdown file...");

        const file_path = await createMarkdownFile(markdown_content, `${bookInfo.slug}.md`);
        if (file_path) {
            console.log("Markdown file created successfully.");
        }
        else {
            console.log("Error creating Markdown file.");
        }
        console.log("Done.");
    }
    else {
        console.log("Book not found or an error occurred.");
    }
}

(async () => await main())();
import * as fs from 'fs-extra';
const axios = require('axios');
import * as dotenv from 'dotenv';
import prompts = require("prompts");
import * as path from 'path';

dotenv.config({ path: '../../.env' });

const TMDB_API_KEY = process.env.TMDB_API_KEY!;
const MOVIE_COVERS_PATH = "../Attachments/movie_covers";
const MOVIE_PATH = "../Library/Movies";
const SERIE_COVERS_PATH = "../Attachments/serie_covers";
const SERIE_PATH = "../Library/Series";
const ANIME_COVERS_PATH = "../Attachments/anime_covers";
const ANIME_PATH = "../Library/Animes";

// Interface for movie, serie, and anime data
interface MediaInfo {
    title: string;
    slug: string;
    release_date?: string;
    genres?: Array<string>;
    summary?: string;
}

// Fetch movie data from TMDB API by ID
async function fetchMovieById(id: number): Promise<MediaInfo | null> {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/movie/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${TMDB_API_KEY}`,
                    accept: 'application/json'
                },
                params: {
                    language: 'en-US'
                }
            });

        const movie_fetched = response.data;

        const confirm = await prompts({
            type: "confirm",
            name: "value",
            message: `Do you want to add "${movie_fetched.title}" to the database? (Y/n)`,
            initial: true,
        });

        if (!confirm.value) {
            process.exit(0);
        }

        const movie_info: MediaInfo = {
            title: movie_fetched.title,
            slug: movie_fetched.title
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
            release_date: movie_fetched.release_date ?? "",
            genres: movie_fetched.genres?.map((genre: any) => genre.name) ?? [],
            summary: movie_fetched.overview ?? "No summary available"
        };

        const cover_url = movie_fetched.poster_path ? `https://image.tmdb.org/t/p/original${movie_fetched.poster_path}` : "";
        if (cover_url) {
            await downloadImage(cover_url, `${movie_info.slug}.jpg`, MOVIE_COVERS_PATH);
        } else {
            console.log(`No poster found for ${movie_info.title}`);
        }
        return movie_info;
    } catch (error: any) {
        console.error("Error fetching movie data:", error);
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

// Fetch serie data from TMDB API by ID
async function fetchSerieById(id: number, media_type: number): Promise<MediaInfo | null> {
    try {
        const response = await axios.get(`https://api.themoviedb.org/3/tv/${id}`,
            {
                headers: {
                    Authorization: `Bearer ${TMDB_API_KEY}`,
                    accept: 'application/json'
                },
                params: {
                    language: 'en-US'
                }
            });

        const serie_fetched = response.data;

        const confirm = await prompts({
            type: "confirm",
            name: "value",
            message: `Do you want to add "${serie_fetched.name}" to the database? (Y/n)`,
            initial: true,
        });

        if (!confirm.value) {
            process.exit(0);
        }

        const serie_info: MediaInfo = {
            title: serie_fetched.name,
            slug: serie_fetched.name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-+|-+$/g, ""),
            release_date: serie_fetched.first_air_date ?? "",
            genres: serie_fetched.genres?.map((genre: any) => genre.name) ?? [],
            summary: serie_fetched.overview ?? "No summary available"
        };

        const cover_url = serie_fetched.poster_path ? `https://image.tmdb.org/t/p/original${serie_fetched.poster_path}` : "";
        if (cover_url) {
            await downloadImage(cover_url, `${serie_info.slug}.jpg`, media_type == 3 ? ANIME_COVERS_PATH : SERIE_COVERS_PATH);
        } else {
            console.log(`No poster found for ${serie_info.title}`);
        }
        return serie_info;
    } catch (error: any) {
        console.error("Error fetching tv show data:", error);
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

// Download image
async function downloadImage(url: string, filename: string, media_path: string) {
    try {
        // Treat the image as binary data
        const response = await axios.get(url, { responseType: "arraybuffer" })

        // Ensure the directory exists else create it
        const dir = path.join(process.cwd(), media_path);
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
function generateMarkdown(media_info: MediaInfo, media: string): string {
    return `---
title: "${media_info.title}"
rating:
release_date: "${media_info.release_date}"
tags:
    - ${media}
    ${media_info.genres?.map((category: string) => `- ${category
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")}`)
            .join("\n    ")}
    - watchlist
cover: "[[${media_info.slug}.jpg]]"
---
> [!NOTE] Summary
${media_info.summary?.split("\n").map(line => `> ${line}`).join("\n")}`;
}

// Create markdown file
async function createMarkdownFile(content: string, filename: string, media_path: string): Promise<string | null> {
    try {
        const dir = path.join(process.cwd(), media_path);
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
        name: "gameId",
        message: "Please enter a TMDB ID:",
        validate: (value: string) => {
            const n = Number(value);
            if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
                return "TMDB ID must be a positive integer";
            }
            return true;
        }
    });

    const mediaId: number = response.gameId;

    const media_type = await prompts({
        type: "number",
        name: "value",
        message: `Select media type ("1" for movie, 2 for serie, 3 for anime):`,
        initial: 1
    });

    const mediaInfo = media_type.value == 1 ? await fetchMovieById(mediaId) : media_type.value == 2 ? await fetchSerieById(mediaId, media_type.value) : await fetchSerieById(mediaId, media_type.value);
    if (mediaInfo) {
        console.log("Media fetched successfully.");
        console.log("Generating Markdown file...");

        const markdown_content = generateMarkdown(mediaInfo, media_type.value == 1 ? "movie" : media_type.value == 2 ? "serie" : "anime");
        console.log("Markdown content generated successfully.");
        console.log("Creating Markdown file...");

        const file_path = await createMarkdownFile(markdown_content, `${mediaInfo.slug}.md`, media_type.value == 1 ? MOVIE_PATH : media_type.value == 2 ? SERIE_PATH : ANIME_PATH);
        if (file_path) {
            console.log("Markdown file created successfully.");
        }
        else {
            console.log("Error creating Markdown file.");
        }
        console.log("Done.");
    }
    else {
        console.log("Media not found or an error occurred.");
    }
}

(async () => await main())();
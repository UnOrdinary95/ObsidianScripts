import * as fs from 'fs-extra';
const axios = require('axios');
import * as dotenv from 'dotenv';
import prompts = require("prompts"); // Ignore TS error
import * as path from 'path';

dotenv.config({ path: '../../.env' });

const CLIENT_ID = process.env.CLIENT_ID!;
const CLIENT_SECRET = process.env.CLIENT_SECRET!;
const TOKEN_FILE = "./tokenTwitch.json";
const GAME_COVERS_PATH = "../Attachments/game_covers";
const GAME_PATH = "../Library/Games";

// Interface for game data
interface GameInfo {
    title: string;
    slug: string;
    release_date?: string;
    genres?: Array<string>;
    themes?: Array<string>;
    summary?: string;
}

// Fetch a new access token from Twitch
async function fetchNewToken(): Promise<{ access_token: string, expires_in: number }> {
    try {
        const response = await axios.post(
            'https://id.twitch.tv/oauth2/token',
            null,
            {
                params: {
                    client_id: CLIENT_ID,
                    client_secret: CLIENT_SECRET,
                    grant_type: 'client_credentials'
                }
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error while fetching token:", error);
        throw error;
    }
}

// Get a valid access token
async function getToken(): Promise<string | null> {
    try {
        // Check if a token is already saved
        if (fs.existsSync(TOKEN_FILE)) {
            const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf-8'));
            const now = Math.floor(Date.now() / 1000);
            if (saved.expires_at > now) {
                // Return the saved token
                return saved.access_token;
            }
        }

        // Else fetch a new token
        const data = await fetchNewToken();
        const expires_at = Math.floor(Date.now() / 1000) + data.expires_in;
        // Save the token
        fs.writeFileSync(
            TOKEN_FILE,
            JSON.stringify({ access_token: data.access_token, expires_at: expires_at }, null, 4)
        );
        return data.access_token;
    } catch (error) {
        console.error("Error while fetching or generating token:", error);
        return null;
    }
}

// Fetch game data from IGDB API by ID
async function fetchGameById(id: number): Promise<GameInfo | null> {
    try {
        const token = await getToken();
        if (!token) {
            console.error("No token found - script terminated.");
            process.exit(1);
        }

        const response = await axios.post(
            "https://api.igdb.com/v4/games",
            `fields name, slug, genres.slug, themes.slug, first_release_date, cover.url, summary; where id = ${id};`,
            {
                headers: {
                    "Client-ID": CLIENT_ID,
                    "Authorization": `Bearer ${token}`,
                    "Accept": "application/json"
                }
            }
        );

        // Extract game data
        const game_fetched = response.data[0];

        const confirm = await prompts({
            type: "confirm",
            name: "value",
            message: `Do you want to add "${game_fetched.name}" to the database? (Y/n)`,
            initial: true,
        });

        if (!confirm.value) {
            process.exit(0);
        }

        // Format release date
        const date = new Date(game_fetched.first_release_date * 1000);
        const day = String(date.getDate()).padStart(2, "0");
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const year = date.getFullYear();
        const date_formatted = `${year}-${month}-${day}`;

        // Download game cover
        if (game_fetched.cover.url) {
            let cover_url = game_fetched.cover.url.replace("t_thumb", "t_original");
            // Add https:// if the URL doesn't start with it
            if (cover_url.startsWith("//")) {
                cover_url = "https:" + cover_url;
            }
            await downloadImage(cover_url, `${game_fetched.slug}.jpg`);
        }

        // Return game info
        const game_info: GameInfo = {
            title: game_fetched.name,
            slug: game_fetched.slug,
            release_date: date_formatted ?? "",
            genres: game_fetched.genres?.map((genre: { slug: string }) => genre.slug) ?? ["unknown"],
            themes: game_fetched.themes?.map((theme: { slug: string }) => theme.slug) ?? ["unknown"],
            summary: game_fetched.summary ?? "No summary available."
        };
        return game_info;
    } catch (error: any) {
        console.error("Error fetching game data:", error);
        if (axios.isAxiosError(error)) {
            if (error.response) {
                // Server responded with error status
                console.error(`API Error: ${error.response.status} - ${error.response.statusText}`);
                if (error.response.status === 401) {
                    console.error("Authentication failed. Please check your CLIENT_ID and CLIENT_SECRET.");
                } else if (error.response.status === 404) {
                    console.error("Game not found with the provided ID.");
                } else if (error.response.status === 429) {
                    console.error("Rate limit exceeded. Please try again later.");
                }
            } else if (error.request) {
                // Network error
                console.error("Network error: Unable to connect to IGDB API");
            }
            else {
                console.error("Unexpected error:", error.message);
            }
        }
        return null;
    }
}

// Download game cover
async function downloadImage(url: string, filename: string) {
    try {
        // Treat the image as binary data
        const response = await axios.get(url, { responseType: "arraybuffer" })

        // Ensure the directory exists else create it
        const dir = path.join(process.cwd(), GAME_COVERS_PATH);
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

function generateMarkdown(game_info: GameInfo): string {
    return `---
title: "${game_info.title}"
rating:
release_date: "${game_info.release_date}"
tags:
    - game
    ${game_info.genres?.map((genre: string) => `- ${genre}`).join("\n    ")}
    ${game_info.themes?.map((theme: string) => `- ${theme}`).join("\n    ")}
    - wishlist
cover: "[[${game_info.slug}.jpg]]"
---
> [!NOTE] Summary
${game_info.summary?.split("\n").map(line => `> ${line}`).join("\n")}`;
}

async function createMarkdownFile(content: string, filename: string): Promise<string | null> {
    try {
        const dir = path.join(process.cwd(), GAME_PATH);
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
    // Get user input: IGDB ID
    const response = await prompts({
        type: "text",
        name: "gameId",
        message: "Please enter an IGDB ID:",
        validate: (value: string) => {
            const n = Number(value);
            if (isNaN(n) || !Number.isInteger(n) || n <= 0) {
                return "IGDB ID must be a positive integer";
            }
            return true;
        }
    });

    const gameId: number = response.gameId;

    const gameInfo = await fetchGameById(gameId);
    if (gameInfo) {
        console.log("Game fetched successfully.");
        console.log("Generating Markdown file...");

        const markdown_content = generateMarkdown(gameInfo);
        console.log("Markdown content generated successfully.");
        console.log("Creating Markdown file...");

        const file_path = await createMarkdownFile(markdown_content, `${gameInfo.slug}.md`);
        if (file_path) {
            console.log("Markdown file created successfully.");
        }
        else {
            console.error("Error creating Markdown file.");
        }
        console.log("Done.");
    } else {
        console.error("No game found or an error occurred.");
    }
}

(async () => {
    await main();
})();

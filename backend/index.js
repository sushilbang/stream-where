require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const OMDB_KEY = process.env.OMDB_API_KEY;
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;

// 1. Search for a Movie (Using OMDb)
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Query required" });

    try {
        const url = `http://www.omdbapi.com/?apikey=${OMDB_KEY}&s=${query}`;
        const response = await axios.get(url);

        if (response.data.Error) {
            return res.json([]);
        }

        // Return top 5 results, mapped to a clean format
        const results = response.data.Search.slice(0, 5).map(movie => ({
            id: movie.imdbID,
            title: movie.Title,
            year: movie.Year,
            poster: movie.Poster
        }));

        res.json(results);
    } catch (error) {
        console.error("OMDb Error:", error.message);
        res.status(500).json({ error: "Search failed" });
    }
});

// 2. Get Streaming Providers (Using RapidAPI)
app.get('/api/providers/:imdbId', async (req, res) => {
    const { imdbId } = req.params;

    try {
        const options = {
            method: 'GET',
            url: 'https://streaming-availability.p.rapidapi.com/get/basic',
            params: {
                country: 'in', // Look specifically in INDIA
                imdb_id: imdbId,
                output_language: 'en'
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com'
            }
        };

        const response = await axios.request(options);
        const streamingData = response.data.result?.streamingInfo?.in || [];

        // Group them into "Flatrate" (Subscription), "Rent", "Buy"
        const flatrate = streamingData.filter(s => s.streamingType === 'subscription' || s.streamingType === 'addon');
        const rent = streamingData.filter(s => s.streamingType === 'rent');
        const buy = streamingData.filter(s => s.streamingType === 'buy');

        res.json({
            link: response.data.result?.imdbLink || "", // Link back to IMDb
            flatrate: flatrate,
            rent: rent,
            buy: buy
        });

    } catch (error) {
        console.error("RapidAPI Error:", error.message);
        // Don't crash the app, just return empty availability
        res.json({ flatrate: [], rent: [], buy: [], message: "Provider data unavailable" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
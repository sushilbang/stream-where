require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors()); // allow frontend to hit on backend
app.use(express.json());

const PORT = process.env.PORT || 3000;
const TMDB_KEY = process.env.TMDB_API_KEY;

// search for a movie
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if(!query) return res.status(400).json({ error: "Query required" });

    try {
        const url = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_KEY}&query=${query}`;
        const response = await axios.get(url);
        res.json(response.data.results.slice(0, 5));
    } catch (error) {
        res.status(500).json({ error: "TMDB API Error" });
    }
});

// get streaming providers
app.get('api/providers/:movieId', async (req, res) => {
    try {
        const url = `https://api.themoviedb.org/3/movie/${movieId}/watch/providers?api_key=${TMDB_KEY}`;
        const response = await axios.get(url);
        // specific for india
        const indiaData = response.data.results['IN'];

        if(!indiaData) {
            return res.json({ message: "Not available to stream India." });
        }

        res.json({
            link: indiaData.link,
            flatrate: indiaData.flatrate || [], // Netflix, Prime, etc.
            rent: indiaData.rent || [], // Youtube Rent, Apple TV
            buy: indiaData.buy || []
        });
    } catch (error) {
        res.status(500).json({ error: "Failed to fetch providers" });
    }
});


// aji sunte ho?
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
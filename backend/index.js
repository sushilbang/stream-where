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

// Simple in-memory cache with 24-hour TTL
const cache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

function getFromCache(key) {
    const cached = cache.get(key);
    if (!cached) return null;
    if (Date.now() - cached.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }
    return cached.data;
}

function setCache(key, data) {
    cache.set(key, { data, timestamp: Date.now() });
}

// Clean expired cache entries every hour
setInterval(() => {
    const now = Date.now();
    for (const [key, value] of cache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
            cache.delete(key);
        }
    }
}, 60 * 60 * 1000);

// 1. Search for a Movie (Using OMDb)
app.get('/api/search', async (req, res) => {
    const query = req.query.q;
    if (!query) return res.status(400).json({ error: "Query required" });

    const cacheKey = `search:${query.toLowerCase().trim()}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
        return res.json(cached);
    }

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

        setCache(cacheKey, results);
        res.json(results);
    } catch (error) {
        console.error("OMDb Error:", error.message);
        res.status(500).json({ error: "Search failed" });
    }
});

// 2. Get Streaming Providers (RapidAPI v4)
app.get('/api/providers/:imdbId', async (req, res) => {
    const { imdbId } = req.params;

    const cacheKey = `providers:${imdbId}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
        return res.json(cached);
    }

    try {
        const options = {
            method: 'GET',
            url: `https://streaming-availability.p.rapidapi.com/shows/${imdbId}`,
            params: {
                output_language: 'en',
                series_granularity: 'show'
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com'
            }
        };

        const response = await axios.request(options);
        const indiaOptions = response.data.streamingOptions?.in || [];

        // Filter by type
        const flatrate = indiaOptions.filter(opt => opt.type === 'subscription');
        const rent = indiaOptions.filter(opt => opt.type === 'rent');
        const buy = indiaOptions.filter(opt => opt.type === 'buy');

        const result = {
            link: response.data.imdbLink || "",
            flatrate: flatrate,
            rent: rent,
            buy: buy
        };

        setCache(cacheKey, result);
        res.json(result);

    } catch (error) {
        console.error("RapidAPI Error:", error.response?.status, error.message);
        res.json({ flatrate: [], rent: [], buy: [], message: "Provider data unavailable" });
    }
});

// Helper function to get providers for a movie (used by bundle endpoint)
async function getProvidersForMovie(imdbId) {
    const cacheKey = `providers:${imdbId}`;
    const cached = getFromCache(cacheKey);
    if (cached) return cached;

    try {
        const options = {
            method: 'GET',
            url: `https://streaming-availability.p.rapidapi.com/shows/${imdbId}`,
            params: {
                output_language: 'en',
                series_granularity: 'show'
            },
            headers: {
                'X-RapidAPI-Key': RAPIDAPI_KEY,
                'X-RapidAPI-Host': 'streaming-availability.p.rapidapi.com'
            }
        };

        const response = await axios.request(options);
        const indiaOptions = response.data.streamingOptions?.in || [];
        const flatrate = indiaOptions.filter(opt => opt.type === 'subscription');

        const result = {
            flatrate,
            rent: indiaOptions.filter(opt => opt.type === 'rent'),
            buy: indiaOptions.filter(opt => opt.type === 'buy')
        };

        setCache(cacheKey, result);
        return result;
    } catch (error) {
        console.error("RapidAPI Error:", error.message);
        return { flatrate: [], rent: [], buy: [] };
    }
}

// Helper function to search for a movie and get first result
async function searchMovie(query) {
    const cacheKey = `search:${query.toLowerCase().trim()}`;
    const cached = getFromCache(cacheKey);
    if (cached && cached.length > 0) return cached[0];

    try {
        const url = `http://www.omdbapi.com/?apikey=${OMDB_KEY}&s=${query}`;
        const response = await axios.get(url);

        if (response.data.Error || !response.data.Search?.length) {
            return null;
        }

        const results = response.data.Search.slice(0, 5).map(movie => ({
            id: movie.imdbID,
            title: movie.Title,
            year: movie.Year,
            poster: movie.Poster
        }));

        setCache(cacheKey, results);
        return results[0];
    } catch (error) {
        console.error("OMDb Error:", error.message);
        return null;
    }
}

// 3. Bundle: Find best streaming service for multiple movies
app.post('/api/bundle', async (req, res) => {
    const { movies } = req.body;

    if (!movies || !Array.isArray(movies) || movies.length === 0 || movies.length > 10) {
        return res.status(400).json({ error: "Please provide 1-10 movie names" });
    }

    try {
        // Step 1: Search for each movie to get IMDb IDs
        const movieResults = await Promise.all(
            movies.map(async (movieName) => {
                const movie = await searchMovie(movieName);
                return movie ? { name: movieName, ...movie } : { name: movieName, notFound: true };
            })
        );

        // Step 2: Get providers for each found movie
        const moviesWithProviders = await Promise.all(
            movieResults.map(async (movie) => {
                if (movie.notFound) {
                    return { ...movie, providers: null };
                }
                const providers = await getProvidersForMovie(movie.id);
                return { ...movie, providers };
            })
        );

        // Step 3: Analyze subscription services
        const serviceMovieMap = {}; // { serviceName: [movieTitles] }

        moviesWithProviders.forEach(movie => {
            if (movie.providers?.flatrate) {
                movie.providers.flatrate.forEach(provider => {
                    const serviceName = provider.service?.name || provider.service?.id;
                    if (serviceName) {
                        if (!serviceMovieMap[serviceName]) {
                            serviceMovieMap[serviceName] = [];
                        }
                        if (!serviceMovieMap[serviceName].includes(movie.title)) {
                            serviceMovieMap[serviceName].push(movie.title);
                        }
                    }
                });
            }
        });

        // Step 4: Sort services by number of movies available
        const serviceRanking = Object.entries(serviceMovieMap)
            .map(([service, movieList]) => ({
                service,
                movieCount: movieList.length,
                movies: movieList,
                coverage: Math.round((movieList.length / movies.length) * 100)
            }))
            .sort((a, b) => b.movieCount - a.movieCount);

        // Step 5: Find movies not available on any subscription
        const moviesOnSubscription = new Set(
            Object.values(serviceMovieMap).flat()
        );
        const notOnSubscription = moviesWithProviders
            .filter(m => !m.notFound && !moviesOnSubscription.has(m.title))
            .map(m => m.title);

        res.json({
            totalMovies: movies.length,
            foundMovies: movieResults.filter(m => !m.notFound).length,
            notFoundMovies: movieResults.filter(m => m.notFound).map(m => m.name),
            bestService: serviceRanking[0] || null,
            allServices: serviceRanking,
            notOnAnySubscription: notOnSubscription,
            movieDetails: moviesWithProviders.map(m => ({
                searchQuery: m.name,
                title: m.title || null,
                year: m.year || null,
                found: !m.notFound,
                subscriptionServices: m.providers?.flatrate?.map(p => p.service?.name).filter(Boolean) || []
            }))
        });

    } catch (error) {
        console.error("Bundle Error:", error.message);
        res.status(500).json({ error: "Failed to analyze movies" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
import { useState } from 'react'
import axios from 'axios'
import { Search, Film, Tv, MonitorPlay } from 'lucide-react'
import './App.css'

function App() {
  const [query, setQuery] = useState('')
  const [movies, setMovies] = useState([])
  const [selectedMovie, setSelectedMovie] = useState(null)
  const [providers, setProviders] = useState(null)
  const [loading, setLoading] = useState(false)

  // This reads from your new .env file
  const API_URL = import.meta.env.VITE_API_URL

  // 1. Search for Movies
  const searchMovies = async (e) => {
    e.preventDefault()
    if (!query) return
    
    setLoading(true)
    setProviders(null)
    setSelectedMovie(null)
    
    try {
      const res = await axios.get(`${API_URL}/search?q=${query}`)
      setMovies(res.data)
    } catch (err) {
      alert("Failed to fetch movies. Check console.")
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  // 2. Get Streaming Data
  const getProviders = async (movie) => {
    setSelectedMovie(movie)
    setLoading(true)
    try {
      const res = await axios.get(`${API_URL}/providers/${movie.id}`)
      setProviders(res.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container">
      <header>
        <h1>Stream-Where <span className="flag">IN</span></h1>
        <p>Find where to watch movies in India</p>
      </header>

      {/* Search Bar */}
      <form onSubmit={searchMovies} className="search-box">
        <input 
          type="text" 
          placeholder="Enter movie name (e.g. Batman)..." 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="submit" disabled={loading}>
          <Search size={20} />
        </button>
      </form>

      {/* Movie Results Grid */}
      <div className="grid">
        {!selectedMovie && movies.map((movie) => (
          <div key={`${movie.id}-${index}`} className="card" onClick={() => getProviders(movie)}>
            <img src={movie.poster !== "N/A" ? movie.poster : "https://via.placeholder.com/300"} alt={movie.title} />
            <h3>{movie.title}</h3>
            <p>{movie.year}</p>
          </div>
        ))}
      </div>

      {/* Provider Details View */}
      {selectedMovie && providers && (
        <div className="details">
          <button className="back-btn" onClick={() => setSelectedMovie(null)}>← Back</button>
          
          <div className="details-header">
            <img src={selectedMovie.poster} className="mini-poster" />
            <div>
              <h2>{selectedMovie.title}</h2>
              <a href={providers.link} target="_blank" className="imdb-link">View on IMDb</a>
            </div>
          </div>

          <div className="providers-section">
            <div className="provider-group">
              <h3><MonitorPlay size={18}/> Stream</h3>
              <div className="logos">
                {providers.flatrate.length > 0 ? providers.flatrate.map(p => (
                  <span key={p.service} className="badge sub">{p.service.toUpperCase()}</span>
                )) : <span className="empty">Not on subscription</span>}
              </div>
            </div>

            <div className="provider-group">
              <h3><Film size={18}/> Rent</h3>
              <div className="logos">
                {providers.rent.length > 0 ? providers.rent.map(p => (
                  <span key={p.service} className="badge rent">{p.service.toUpperCase()}</span>
                )) : <span className="empty">Not for rent</span>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
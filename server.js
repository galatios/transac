const express = require('express');
const https = require('https');
const app = express();
const port = process.env.PORT || 3000;

// Replace with your actual API key
const apiKey = 'sWSsFoGqpEytUySAFE6YdPfWsaEfwwwf';

app.get('/api/price-target', (req, res) => {
    const symbol = req.query.symbol || 'AAPL';
    console.log(`Fetching price target for: ${symbol}`);

    const options = {
        hostname: 'financialmodelingprep.com',
        port: 443,
        path: `/api/v4/price-target?symbol=${symbol}&apikey=${apiKey}`,
        method: 'GET'
    };

    const request = https.request(options, (response) => {
        let data = '';
        response.on('data', (chunk) => { data += chunk; });
        response.on('end', () => {
            console.log('Raw API Response:', data);
            try {
                const parsedData = JSON.parse(data);
                if (!parsedData || parsedData.length === 0) {
                    return res.status(404).json({ error: 'No price target data available' });
                }
                res.json(parsedData);
            } catch (error) {
                console.error('JSON Parsing Error:', error.message);
                res.status(500).json({ error: 'Error parsing JSON' });
            }
        });
    });

    request.on('error', (error) => {
        console.error('API Request Error:', error.message);
        res.status(500).json({ error: 'Request error: ' + error.message });
    });

    request.end();
});

app.use(express.static('.'));

app.listen(port, () => console.log(`Server running on port ${port}`));

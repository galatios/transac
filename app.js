document.addEventListener('DOMContentLoaded', () => {
    const searchInputElement = document.getElementById('search-input');
    const searchButtonElement = document.getElementById('search-button');
    const filingsContainer = document.getElementById('filings-container');
    const filingsChartElement = document.getElementById('filings-chart').getContext('2d');

    let chart;

    searchButtonElement.addEventListener('click', async () => {
        const ticker = searchInputElement.value.trim();
        if (!ticker) {
            alert('Please enter a valid ticker.');
            return;
        }
        try {
            const cik = await getCikByTicker(ticker);
            const formattedCik = String(cik).padStart(10, '0');
            const apiUrl = getApiUrl(formattedCik);
            await fetchFilings(apiUrl);
        } catch (error) {
            alert(error.message);
        }
    });

    async function getCikByTicker(searchTerm) {
        const response = await fetch('company_tickers.json');
        const data = await response.json();
        const lowerSearch = searchTerm.toLowerCase();
        for (const key in data) {
            const ticker = data[key].ticker.toLowerCase();
            const title = data[key].title.toLowerCase();
            if (ticker === lowerSearch || title.includes(lowerSearch)) {
                return data[key].cik_str;
            }
        }
        throw new Error('Company not found');
    }

    function getApiUrl(cik) {
        // Validate if CIK is a number
        if (!/^\d+$/.test(cik)) {
            alert('Please enter a valid CIK number.');
            return; // Exit the function if the CIK is invalid
        }
        // Construct the API URL for the SEC EDGAR API
        return `https://data.sec.gov/submissions/CIK${cik}.json`;
    }

    async function fetchFilings(apiUrl) {
        filingsContainer.innerHTML = '<p>Loading filings...</p>'; // Show loading message
        try {
            const response = await fetch(apiUrl, {
                headers: {
                    'User-Agent': 'your-app-name (your-email@example.com)' // Replace with your app name and email
                }
            });

            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status}`);
            }

            const filings = await response.json();
            displayFilings(filings);
            displayChart(filings);
        } catch (error) {
            console.error('Error fetching filings:', error);
            filingsContainer.innerHTML = `<p>Error loading filings: ${error.message}</p>`; // Display detailed error
        }
    }

    async function displayFilings(filings) {
        filingsContainer.innerHTML = ''; // Clear existing content

        const recentFilings = filings.filings.recent;

        for (let index = 0; index < recentFilings.filingDate.length; index++) {
            const filingElement = document.createElement('div');
            filingElement.className = 'filing';
            const cik = filings.cik;
            const accessionNumber = recentFilings.accessionNumber[index];
            const formattedAccessionNumber = accessionNumber.replace(/-/g, '');
            const filingIndexUrl = `https://www.sec.gov/Archives/edgar/data/${cik}/${formattedAccessionNumber}/${accessionNumber}-index.htm`;

            // Get XML file link
            const xmlFileUrl = await getXmlFileUrl(filingIndexUrl);

            if (xmlFileUrl) {
                const holdingsData = await fetch13FHoldings(xmlFileUrl);
                filingElement.innerHTML = `
                    <h2>Filing: ${recentFilings.form[index]}</h2>
                    <p>Date Filed: ${recentFilings.filingDate[index]}</p>
                    <p>File Number: ${recentFilings.fileNumber[index]}</p>
                    <a href="${xmlFileUrl}" target="_blank">View XML</a>
                    <h3>Top Holdings:</h3>
                    <pre>${holdingsData}</pre>
                `;
            } else {
                filingElement.innerHTML = `
                    <h2>Filing: ${recentFilings.form[index]}</h2>
                    <p>Date Filed: ${recentFilings.filingDate[index]}</p>
                    <p>File Number: ${recentFilings.fileNumber[index]}</p>
                    <a href="${filingIndexUrl}" target="_blank">View Filing</a>
                    <p><strong>13F XML Not Found</strong></p>
                `;
            }

            filingsContainer.appendChild(filingElement);
        }
    }

    async function getXmlFileUrl(indexUrl) {
        try {
            const response = await fetch(indexUrl);
            const text = await response.text();

            // Extract the XML file link (13F filings contain ".xml" files)
            const xmlMatch = text.match(/href="([^"]+\.xml)"/i);
            if (xmlMatch) {
                return `https://www.sec.gov${xmlMatch[1]}`;
            }
        } catch (error) {
            console.error("Error fetching index page:", error);
        }
        return null;
    }

    async function fetch13FHoldings(xmlUrl) {
        try {
            const response = await fetch(xmlUrl);
            const xmlText = await response.text();

            // Parse the XML
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, "text/xml");

            // Extract key holdings data (issuer name, CUSIP, shares, market value)
            let holdings = [];
            xmlDoc.querySelectorAll("infoTable").forEach((table) => {
                const issuer = table.querySelector("nameOfIssuer")?.textContent;
                const cusip = table.querySelector("cusip")?.textContent;
                const value = table.querySelector("value")?.textContent;
                const shares = table.querySelector("shrsOrPrnAmt > sshPrnamt")?.textContent;

                holdings.push(`Issuer: ${issuer}, CUSIP: ${cusip}, Value: $${value}K, Shares: ${shares}`);
            });

            return holdings.length > 0 ? holdings.slice(0, 5).join("\n") : "No holdings found.";
        } catch (error) {
            console.error("Error fetching 13F XML:", error);
            return "Failed to retrieve holdings.";
        }
    }

    function displayChart(filings) {
        const labels = filings.filings.recent.filingDate;
        const filingSizes = filings.filings.recent.size;
        if (chart) {
            chart.destroy();
        }
        chart = new Chart(filingsChartElement, {
            type: 'bar',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Filing Size',
                        data: filingSizes,
                        backgroundColor: 'rgba(75, 192, 192, 0.6)',
                        borderColor: 'rgba(75, 192, 192, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        labels: {
                            font: { size: 14 }
                        }
                    },
                    title: {
                        display: true,
                        text: 'Filing Sizes Over Time',
                        font: { size: 18 }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Filing Date',
                            font: { size: 16 }
                        },
                        ticks: {
                            font: { size: 12 }
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Size',
                            font: { size: 16 }
                        },
                        ticks: {
                            font: { size: 12 }
                        }
                    }
                }
            }
        });
    }

// avaScript Code to Extract Insider Transactions

async function fetchInsiderTransactions() {
    // URL for a SEC Form 4 filing (Amazon in this example)
    const apiUrl = 'https://www.sec.gov/Archives/edgar/data/1018724/000101872424000202/wk-form4_1733955046.xml';
    const insidersContainer = document.getElementById('insiders-container');
    insidersContainer.innerHTML = '<p>Loading insider transactions…</p>';

    try {
        const response = await fetch(apiUrl, {
            headers: {
                'User-Agent': 'your-app-name (your-email@example.com)' // SEC requires a custom User-Agent
            }
        });

        if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
        }

        const xmlText = await response.text();
        displayRawXml(xmlText);
    } catch (error) {
        console.error('Error fetching insider transactions:', error);
        insidersContainer.innerHTML = `<p>Error loading insider data: ${error.message}</p>`;
    }
}

function displayRawXml(xmlText) {
    const insidersContainer = document.getElementById('insiders-container');
    insidersContainer.innerHTML = ''; // Clear any existing content
    const preElement = document.createElement('pre');
    preElement.textContent = xmlText; // Safely insert raw text content
    insidersContainer.appendChild(preElement);
}

function parseInsiderTransactions(xmlDoc) {
    const transactions = [];

    // Extract insider name
    const insiderName = xmlDoc.querySelector("reportingOwner reportingOwnerId rptOwnerName")?.textContent || "Unknown";

    // Extract transactions from <nonDerivativeTable>
    const nonDerivativeTransactions = xmlDoc.querySelectorAll("nonDerivativeTransaction");

    nonDerivativeTransactions.forEach(transaction => {
        const date = transaction.querySelector("transactionDate value")?.textContent || "N/A";
        const type = transaction.querySelector("transactionCoding transactionCode")?.textContent || "N/A";
        const shares = transaction.querySelector("transactionAmounts transactionShares value")?.textContent || "N/A";
        const price = transaction.querySelector("transactionAmounts transactionPricePerShare value")?.textContent || "N/A";

        transactions.push({ date, type, shares, price, insiderName });
    });

    return transactions;
}

    function displayInsiderTransactions(insiderData) {
        const tableBody = document.querySelector('#insider-transactions-table tbody');
        tableBody.innerHTML = ''; // Clear existing content

        insiderData.forEach((transaction) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${transaction.transactionCode}</td>
                <td>${transaction.share}</td>
                <td>${transaction.transactionPrice}</td>
                <td>${transaction.transactionDate}</td>
            `;
            tableBody.appendChild(row);
        });
    }
});

//  hide logo on scroll
    window.addEventListener('scroll', function() {
        const navbarBrand = document.getElementById('navbarBrand');
        if (window.scrollY > 50) {
            navbarBrand.style.display = 'none';
        } else {
            navbarBrand.style.display = 'inline';
        }
    });

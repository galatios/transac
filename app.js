document.addEventListener('DOMContentLoaded', () => {
    const searchInputElement = document.getElementById('search-input');
    const searchButtonElement = document.getElementById('search-button');
    const filingsContainer = document.getElementById('filings-container');
    const filingsChartElement = document.getElementById('filings-chart').getContext('2d');
    const insidersContainer = document.getElementById('insiders-container');
    let chart;

    searchButtonElement.addEventListener('click', async () => {
        const searchTerm = searchInputElement.value.trim();
        if (!searchTerm) {
            alert('Please enter a valid ticker or company name.');
            return;
        }

        try {
            const cik = await getCikByTicker(searchTerm);
            const formattedCik = String(cik).padStart(10, '0');  // Ensures CIK is 10 digits
            const secBaseUrl = `https://data.sec.gov/submissions/CIK${formattedCik}.json`;

            await fetchFilings(secBaseUrl, formattedCik);
            await fetchInsiderTransactions(formattedCik);
        } catch (error) {
            alert(error.message);
        }
    });

    async function getCikByTicker(searchTerm) {
        const response = await fetch('company_tickers.json');  // Preloaded JSON with tickers
        const data = await response.json();
        const lowerSearch = searchTerm.toLowerCase();

        for (const key in data) {
            if (data[key].ticker.toLowerCase() === lowerSearch || data[key].title.toLowerCase().includes(lowerSearch)) {
                return data[key].cik_str;
            }
        }

        throw new Error('Company not found');
    }

    // Process the XML holdings from 13F filings into custom HTML (pure data)
    async function fetch13FHoldings(xmlFileUrl) {
        try {
            const response = await fetch(xmlFileUrl);
            if (!response.ok) throw new Error(`Network error: ${response.status} fetching XML`);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

            let outputHtml = '<div class="holdings">';
            xmlDoc.querySelectorAll('infoTable').forEach(item => {
                const issuer = item.querySelector('nameOfIssuer')?.textContent || 'N/A';
                const cusip = item.querySelector('cusip')?.textContent || 'N/A';
                const sharesText = item.querySelector('shrsOrPrnAmt > sshPrnamt')?.textContent;
                const priceText = item.querySelector('pricePerShare')?.textContent;
                const shares = sharesText ? parseFloat(sharesText) : 0;
                const price = priceText ? parseFloat(priceText) : 0;
                const totalValue = (shares * price).toFixed(2);

                outputHtml += `
                  <div class="holding-item">
                    <h4>${issuer}</h4>
                    <p>CUSIP: ${cusip}</p>
                    <p>Shares: ${shares}</p>
                    <p>Price per Share: $${price}</p>
                    <p><strong>Total Value:</strong> $${totalValue}</p>
                  </div>
                  <hr>
                `;
            });
            outputHtml += '</div>';
            return outputHtml;
        } catch (error) {
            console.error("Error fetching/parsing XML:", error);
            return `<p>Error fetching/parsing holdings info: ${error.message}</p>`;
        }
    }

    // Fetch filings data, then display filing dates, form types, and file sizes (no SEC links)
    async function fetchFilings(apiUrl, cik) {
        filingsContainer.innerHTML = '<p>Loading filings...</p>';

        try {
            const response = await fetch(apiUrl, { 
                headers: { 'User-Agent': 'Babank ltd babankltd@gmail.com' }
            });

            if (!response.ok) throw new Error(`Network error: ${response.status}`);
            
            const data = await response.json();
            displayFilings(data, cik);
            displayChart(data);
        } catch (error) {
            console.error('Error fetching filings:', error);
            filingsContainer.innerHTML = `<p>Error: ${error.message}</p>`;
        }
    }
//  Updated displayFilings function integrating additional insider details for Form 4 filings
   // Updated displayFilings function integrating additional insider details for Form 4 filings
async function displayFilings(data, cik) {
    const recentFilings = data.filings.recent;
    let tableHtml = `
        <h3>Recent SEC Filings for CIK: ${cik}</h3>
        <table class="table table-dark">
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Form Type</th>
                    <th>Filing Size</th>
                    <th>Insider</th>
                    <th>Company</th>
                    <th>Transaction Type</th>
                    <th>Shares Sold</th>
                    <th>Total Sale Value</th>
                    <th>Date of Transaction</th>
                    <th>Remaining Shares</th>
                </tr>
            </thead>
            <tbody>
    `;

    // Using a for loop to allow asynchronous calls for Form 4 filings
    for (let i = 0; i < recentFilings.filingDate.length; i++) {
        const date = recentFilings.filingDate[i];
        const formType = recentFilings.form[i];
        const size = recentFilings.size ? recentFilings.size[i] : 'N/A';

        if (formType === '4') {
            // Assume that for Form 4 filings you have a filing URL set in recentFilings.filingUrl[i]
            const filingUrl = recentFilings.filingUrl ? recentFilings.filingUrl[i] : null;
            let details = {
                insider: 'N/A',
                company: 'N/A',
                transactionType: 'N/A',
                sharesSold: 'N/A',
                totalSaleValue: 'N/A',
                transactionDate: 'N/A',
                remainingShares: 'N/A'
            };

            if (filingUrl) {
                const processed = await processForm4XML(filingUrl);
                if (processed) details = processed;
            }
            tableHtml += `
                <tr>
                    <td>${date}</td>
                    <td>${formType}</td>
                    <td>${size}</td>
                    <td>${details.insider}</td>
                    <td>${details.company}</td>
                    <td>${details.transactionType}</td>
                    <td>${details.sharesSold}</td>
                    <td>$${details.totalSaleValue}</td>
                    <td>${details.transactionDate}</td>
                    <td>${details.remainingShares}</td>
                </tr>
            `;
        } else {
            // For 13F / 13F-HR filings, no insider details—display placeholders
            tableHtml += `
                <tr>
                    <td>${date}</td>
                    <td>${formType}</td>
                    <td>${size}</td>
                    <td colspan="7" class="text-center">-</td>
                </tr>
            `;
        }
    }

    tableHtml += '</tbody></table>';
    filingsContainer.innerHTML = tableHtml;
}

    // Display the chart for filing sizes
    function displayChart(filings) {
        const labels = filings.filings.recent.filingDate;
        const filingSizes = filings.filings.recent.size;
        const forms = filings.filings.recent.form;

        if (chart) chart.destroy();

        chart = new Chart(filingsChartElement, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Filing Size',
                        data: filingSizes,
                        backgroundColor: 'rgba(54, 162, 235, 0.6)',
                        borderColor: 'rgba(54, 162, 235, 1)',
                        borderWidth: 1
                    },
                    {
                        label: 'Form Type (index)',
                        data: forms.map((_, index) => index + 1),
                        backgroundColor: 'rgba(255, 206, 86, 0.6)',
                        borderColor: 'rgba(255, 206, 86, 1)',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                plugins: {
                    title: { display: true, text: 'SEC Filings Overview' }
                },
                scales: {
                    x: { title: { display: true, text: 'Date' } },
                    y: { title: { display: true, text: 'Value' } }
                }
            }
        });
    }

    // Fetch insider transactions (Form 4) and process XML to extract key insider info (without SEC links)
    async function fetchInsiderTransactions(cik) {
        const apiUrl = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=4&dateb=&owner=include&count=10&output=atom`;
        insidersContainer.innerHTML = '<p>Loading insider transactions…</p>';

        try {
            const response = await fetch(apiUrl, { 
                headers: { 'User-Agent': 'Babank ltd babankltd@gmail.com' }
            });

            if (!response.ok) throw new Error(`Network error: ${response.status}`);
            
            const xmlText = await response.text();
            const transactions = parseForm4XML(xmlText);
            displayInsiderTransactions(transactions);
        } catch (error) {
            console.error('Error fetching insider transactions:', error);
            insidersContainer.innerHTML = `<p>Error: ${error.message}</p>`;
        }
    }

    function parseForm4XML(xmlText) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, 'application/xml');
        const transactions = [];

        xmlDoc.querySelectorAll('entry').forEach(entry => {
            const title = entry.querySelector('title')?.textContent || 'N/A';
            const updated = entry.querySelector('updated')?.textContent || 'N/A';
            const link = entry.querySelector('link')?.getAttribute('href'); // URL to Form 4 XML
            
            transactions.push({ title, updated, link });
        });

        return transactions;
    }

    async function processForm4XML(xmlFileUrl) {
        try {
            const response = await fetch(xmlFileUrl);
            if (!response.ok) throw new Error(`Network error: ${response.status}`);
            const xmlText = await response.text();
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlText, 'application/xml');

            const insider = xmlDoc.querySelector('reportingOwner > reportingOwnerId > rptOwnerName')?.textContent || 'N/A';
            const company = xmlDoc.querySelector('issuer > issuerName')?.textContent || 'N/A';
            const transactionType = xmlDoc.querySelector('transactionCoding > transactionCode')?.textContent || 'N/A';
            const sharesSoldText = xmlDoc.querySelector('transactionShares')?.textContent || '0';
            const sharesSold = parseFloat(sharesSoldText);
            const pricePerShareText = xmlDoc.querySelector('transactionPricePerShare')?.textContent || '0';
            const pricePerShare = parseFloat(pricePerShareText);
            const totalSaleValue = (sharesSold * pricePerShare).toFixed(2);
            const transactionDate = xmlDoc.querySelector('transactionDate')?.textContent || 'N/A';
            const remainingShares = xmlDoc.querySelector('postTransactionAmounts > sharesOwnedFollowingTransaction')?.textContent || 'N/A';

            return {
                insider,
                company,
                transactionType,
                sharesSold,
                totalSaleValue,
                transactionDate,
                remainingShares
            };
        } catch (error) {
            console.error("Error processing Form 4 XML:", error);
            return null;
        }
    }

    async function displayInsiderTransactions(transactions) {
        const tbody = document.querySelector("#insider-transactions-table tbody");
        tbody.innerHTML = ''; // Clear previous results

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7">No insider transactions found.</td></tr>';
            return;
        }

        for (const transaction of transactions) {
            // Process and extract detailed info from each Form 4 filing XML
            const details = await processForm4XML(transaction.link);
            if (!details) continue;

            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${details.insider}</td>
                <td>${details.company}</td>
                <td>${details.transactionType}</td>
                <td>${details.sharesSold}</td>
                <td>$${details.totalSaleValue}</td>
                <td>${details.transactionDate}</td>
                <td>${details.remainingShares}</td>
            `;
            tbody.appendChild(row);
        }
    }
});
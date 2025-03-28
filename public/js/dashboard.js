document.addEventListener("DOMContentLoaded", async () => {
    try {
        const response = await fetch('/api/reports');
        
        if (!response.ok) {
            console.error("Error fetching reports:", response.statusText);
            return;
        }

        const reports = await response.json();
        
        const tbody = document.getElementById('reports-body');
        tbody.innerHTML = ''; // Clear the existing rows

        reports.forEach(report => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${report.id}</td>
                <td>${report.type}</td>
                <td>${report.location}</td>
                <td>${new Date(report.time).toLocaleString()}</td> <!-- Convert the time to a readable format -->
                <td><img src="${report.image}" alt="image" width="50"></td>
                <td>${report.status}</td>
                <td>${report.reportedBy}</td>
            `;
            tbody.appendChild(row);
        });
    } catch (error) {
        console.error("Error loading reports:", error);
        alert("שגיאה בטעינת הדיווחים: " + error.message);
    }
});

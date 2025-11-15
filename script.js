document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'http://localhost:5000';
    const currentPath = window.location.pathname.split('/').pop();

    const fetchWithHandling = async (url, options = {}) => {
        try {
            const response = await fetch(url, options);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const jsonResponse = await response.json();
            return jsonResponse.data; // <-- Access the data property
        } catch (error) {
            console.error('Fetch Error:', error);
            // Optionally, display an error message to the user
            return null;
        }
    };

    const updateAlertBadge = async () => {
        const alerts = await fetchWithHandling(`${API_URL}/alerts`);
        const pendingAlerts = alerts ? alerts.filter(a => a.status === 'Pending').length : 0;
        const badge = document.querySelector('.alert-badge');
        if (badge) {
            if (pendingAlerts > 0) {
                badge.textContent = pendingAlerts;
                badge.style.display = 'inline';
            } else {
                badge.style.display = 'none';
            }
        }
    };

    const getStatusClass = (level) => {
        if (level > 80) return 'danger';
        if (level >= 50) return 'warning';
        return 'good';
    };

    // Dashboard Page
    if (currentPath === 'index.html' || currentPath === '') {
        const binsContainer = document.getElementById('bins-container');
        const statsContainer = document.getElementById('dashboard-stats');
        const refreshBtn = document.getElementById('refresh-btn');

        const fetchDashboardData = async () => {
            const bins = await fetchWithHandling(`${API_URL}/bins`);
            const stats = await fetchWithHandling(`${API_URL}/dashboard/stats`);

            if (bins) renderBins(bins);
            if (stats) renderStats(stats);
            updateAlertBadge();
        };

        const renderBins = (bins) => {
            binsContainer.innerHTML = '';
            bins.forEach(bin => {
                const statusClass = getStatusClass(bin.current_level);
                const binCard = document.createElement('div');
                binCard.className = `bin-card status-${statusClass}`;
                binCard.innerHTML = `
                    <div class="bin-card-header">
                        <h3>${bin.location_name}</h3>
                        <span class="bin-id">Bin #${bin.bin_id}</span>
                    </div>
                    <div class="bin-info">
                        <p><strong>Type:</strong> ${bin.type}</p>
                        <p><strong>Capacity:</strong> ${bin.capacity} kg</p>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill status-${statusClass}" style="width: ${bin.current_level}%;">
                            ${bin.current_level}%
                        </div>
                    </div>
                    <p class="timestamp">Last updated: ${new Date(bin.last_updated).toLocaleString()}</p>
                `;
                binsContainer.appendChild(binCard);
            });
        };

        const renderStats = (stats) => {
            statsContainer.innerHTML = `
                <div class="stat-card total-bins">
                    <i class="fas fa-trash"></i>
                    <div class="stat-info">
                        <h3>${stats.bins.total_bins}</h3>
                        <p>Total Bins</p>
                    </div>
                </div>
                <div class="stat-card full-bins">
                    <i class="fas fa-exclamation-triangle"></i>
                    <div class="stat-info">
                        <h3>${stats.bins.full_bins}</h3>
                        <p>Bins > 80% Full</p>
                    </div>
                </div>
                <div class="stat-card active-alerts">
                    <i class="fas fa-bell"></i>
                    <div class="stat-info">
                        <h3>${stats.alerts.pending_alerts}</h3>
                        <p>Active Alerts</p>
                    </div>
                </div>
            `;
        };

        refreshBtn.addEventListener('click', fetchDashboardData);
        fetchDashboardData();
        setInterval(fetchDashboardData, 30000); // Auto-refresh every 30 seconds
    }

    // Alerts Page
    if (currentPath === 'alerts.html') {
        const alertsContainer = document.getElementById('alerts-container');

        const fetchAlerts = async () => {
            const alerts = await fetchWithHandling(`${API_URL}/alerts`);
            if (alerts) {
                const filteredAlerts = alerts.filter(alert => alert.current_level >= 80);
                renderAlerts(filteredAlerts);
            }
            updateAlertBadge();
        };

        const renderAlerts = (alerts) => {
            alertsContainer.innerHTML = '';
            if (alerts.length === 0) {
                alertsContainer.innerHTML = '<p>No alerts to show.</p>';
                return;
            }
            alerts.forEach(alert => {
                const alertCard = document.createElement('div');
                alertCard.className = `alert-card ${alert.status === 'Resolved' ? 'status-resolved' : ''}`;
                alertCard.innerHTML = `
                    <h3>
                        ${alert.status === 'Pending' ? '<i class="fas fa-exclamation-circle blinking-icon"></i>' : '<i class="fas fa-check-circle"></i>'}
                        Alert for Bin #${alert.bin_id}
                    </h3>
                    <p><strong>Location:</strong> ${alert.location_name}</p>
                    <p><strong>Alert Type:</strong> ${alert.alert_type}</p>
                    <p><strong>Time:</strong> ${new Date(alert.alert_time).toLocaleString()}</p>
                    <p><strong>Status:</strong> ${alert.status}</p>
                    ${alert.status === 'Pending' ? `<button class="btn btn-secondary resolve-btn" data-id="${alert.alert_id}">Mark as Resolved</button>` : ''}
                `;
                alertsContainer.appendChild(alertCard);
            });

            document.querySelectorAll('.resolve-btn').forEach(button => {
                button.addEventListener('click', async (e) => {
                    const alertId = e.target.dataset.id;
                    const result = await fetchWithHandling(`${API_URL}/alerts/${alertId}`, { method: 'PUT' });
                    if (result) {
                        fetchAlerts(); // Refresh alerts list
                    }
                });
            });
        };

        fetchAlerts();
    }

    // Add Waste Page
    if (currentPath === 'add-waste.html') {
        const form = document.getElementById('add-waste-form');
        const locationSelect = document.getElementById('location');
        const binSelect = document.getElementById('bin');
        const staffSelect = document.getElementById('staff');
        const successMessage = document.getElementById('success-message');

        const populateDropdown = (selectElement, data, valueField, textField) => {
            selectElement.innerHTML = `<option value="">-- Select ${selectElement.id.charAt(0).toUpperCase() + selectElement.id.slice(1)} --</option>`;
            data.forEach(item => {
                const option = document.createElement('option');
                option.value = item[valueField];
                option.textContent = item[textField];
                selectElement.appendChild(option);
            });
        };

        const loadInitialData = async () => {
            const [locations, staff, bins] = await Promise.all([
                fetchWithHandling(`${API_URL}/locations`),
                fetchWithHandling(`${API_URL}/staff`),
                fetchWithHandling(`${API_URL}/bins`)
            ]);

            if (locations) populateDropdown(locationSelect, locations, 'location_id', 'location_name');
            if (staff) populateDropdown(staffSelect, staff, 'staff_id', 'name');

            locationSelect.addEventListener('change', () => {
                const selectedLocationId = locationSelect.value;
                if (selectedLocationId) {
                    const filteredBins = bins.filter(b => b.location_id == selectedLocationId);
                    populateDropdown(binSelect, filteredBins, 'bin_id', 'bin_id');
                    binSelect.disabled = false;
                } else {
                    binSelect.innerHTML = '<option value="">-- Select Location First --</option>';
                    binSelect.disabled = true;
                }
            });
        };

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            const wasteData = {
                bin_id: formData.get('bin'),
                collected_by: formData.get('staff'),
                waste_weight: formData.get('weight'),
            };

            const result = await fetchWithHandling(`${API_URL}/waste`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wasteData),
            });

            if (result) {
                successMessage.style.display = 'block';
                form.reset();
                binSelect.innerHTML = '<option value="">-- Select Location First --</option>';
                binSelect.disabled = true;
                updateAlertBadge(); // Refresh alert badge in header
                setTimeout(() => {
                    successMessage.style.display = 'none';
                }, 3000);
            }
        });

        loadInitialData();
        updateAlertBadge();
    }

    // Initial alert badge check on any page load
    updateAlertBadge();
});
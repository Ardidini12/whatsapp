function setupBirthdayDashboard() {
    const listElement = document.getElementById('birthday-list');
    const eventSource = new EventSource('/api/todays-birthdays');

    eventSource.onmessage = (event) => {
        const contacts = JSON.parse(event.data);
        listElement.innerHTML = contacts.map(contact => `
            <div class="birthday-contact">
                <h3>${contact.name} ${contact.surname}</h3>
                <p>Phone: ${contact.phone_number}</p>
                <p>Birthday: ${new Date(contact.birthday).toLocaleDateString()}</p>
            </div>
        `).join('');
    };
}

// Call this when your dashboard loads
setupBirthdayDashboard(); 
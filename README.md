# Start application
pm2 start app.js
pm2 start whatsappClient.js 

# Start with name
pm2 start app.js --name "whatsapp-web"

# List all processes
pm2 list
pm2 ls

# Stop process
pm2 stop app
pm2 stop 0  # Using ID

# Restart process
pm2 restart app

# Delete process
pm2 delete app


git clone https://github.com/Ardidini12/whatsapp.git
cd whatsapp
npm install

CREATE DATABASE whatsapp_db;

npm install sequelize sequelize-cli mysql2

npx sequelize-cli db:migrate \
  --url 'mysql://root:YOUR_PASSWORD@localhost/whatsapp_db' \
  --migrations-path migrations/



#!/bin/bash
echo "Updating Nginx configuration to correctly route API and Secure Files..."

CONFIG_FILE="/etc/nginx/sites-available/cc"

# Backup the original config
sudo cp $CONFIG_FILE ${CONFIG_FILE}.bak

# Replace the static /uploads/ block with the proxy block
sudo sed -i '/location \/uploads\/ {/,/}/c\
    location /db/ {\n\
        proxy_pass http://127.0.0.1:8084/db/;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
\n\
    location /api/upload {\n\
        proxy_pass http://127.0.0.1:8084/api/upload;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\n\
\n\
    location /uploads/ {\n\
        proxy_pass http://127.0.0.1:8084/db/file/;\n\
        proxy_set_header Host $host;\n\
        proxy_set_header X-Real-IP $remote_addr;\n\
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n\
        proxy_set_header X-Forwarded-Proto $scheme;\n\
    }\
' $CONFIG_FILE

# Test and reload
sudo nginx -t
if [ $? -eq 0 ]; then
    sudo systemctl reload nginx
    echo "✅ Nginx updated and reloaded successfully!"
else
    echo "❌ Nginx configuration test failed. Restoring backup..."
    sudo cp ${CONFIG_FILE}.bak $CONFIG_FILE
    sudo systemctl reload nginx
fi

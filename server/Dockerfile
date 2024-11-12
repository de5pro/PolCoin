# Use an official Node.js runtime as a parent image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy the package.json and package-lock.json files
COPY package*.json ./

# Install any necessary dependencies
RUN npm install

# Copy the rest of the application code to the container
COPY . .

# Copy the .env file
COPY .env .env

# Expose the HTTP port and WebSocket port
EXPOSE ${HTTP_PORT} ${WS_PORT}

# Run the application
CMD ["node", "node-server.js"]
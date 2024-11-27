# Use the official Node.js Alpine image for a lightweight setup
FROM node:alpine

# Create the required directories and set permissions for the node user
RUN mkdir -p /home/node/app/node_modules && \
    chown -R node:node /home/node/app && \
    mkdir /home/node/app/uploads && \
    chown -R node:node /home/node/app/uploads

# Set the working directory to the app directory
WORKDIR /home/node/app

# Set the user to 'node' for security
USER node

# Copy the package.json and package-lock.json and install dependencies
COPY --chown=node:node package*.json ./
RUN npm install

# Copy the remaining application files
COPY --chown=node:node . .

# Expose port 5000 for the application
EXPOSE ${HTTP_PORT} ${WS_PORT}

# Start the application
CMD ["node", "node-server.js"]

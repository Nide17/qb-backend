FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY statistics-service/package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY statistics-service/ .

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001
USER nodejs

# Expose port
EXPOSE 5011

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5011/', (res) => { process.exit(res.status === 200 ? 0 : 1) })"

# Start the application
CMD ["npm", "start"]

# QB Backend Microservices

A modern, scalable microservices architecture for the QB platform, designed to efficiently manage MongoDB resources and provide a robust API for frontend applications.

## 🚀 Features

- **Efficient MongoDB Usage**: Separate databases per service to optimize free tier usage
- **Advanced Data Aggregation**: 6 comprehensive aggregated endpoints for frontend efficiency
- **Intelligent Caching**: Redis caching with pattern invalidation
- **Health Monitoring**: Real-time service status monitoring with performance metrics
- **Frontend-Friendly**: Aggregated endpoints that reduce API calls and improve performance
- **Shared Utilities**: Centralized logging, validation, service communication, and cache management
- **Docker Support**: Containerized deployment with health checks and graceful shutdown
- **Resilience Patterns**: Circuit breaker and retry mechanisms for service communication
- **Comprehensive Logging**: Structured logging with Winston for all services
- **Request Validation**: Joi-based validation schemas for all endpoints

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   API Gateway   │    │   Microservices │
│                 │◄──►│                 │◄──►│                 │
│                 │    │ • Aggregation   │    │ • Users         │
│                 │    │ • Caching       │    │ • Quizzing      │
│                 │    │ • Routing       │    │ • Posts         │
└─────────────────┘    └─────────────────┘    │ • Schools       │
                                              │ • Courses       │
                                              │ • Scores        │
                                              │ • Downloads     │
                                              │ • Contacts      │
                                              │ • Feedbacks     │
                                              │ • Comments      │
                                              │ • Statistics    │
                                              └─────────────────┘
```

## 🛠️ Services

| Service | Port | Description |
|---------|------|-------------|
| API Gateway | 5000 | Main entry point with data aggregation |
| Users | 5001 | User management and authentication |
| Quizzing | 5002 | Quizzes, questions, and categories |
| Posts | 5003 | Blog posts, FAQs, and advertisements |
| Schools | 5004 | Educational institutions and levels |
| Courses | 5005 | Course management and chapters |
| Scores | 5006 | Quiz scores and analytics |
| Downloads | 5007 | File download management |
| Contacts | 5008 | Contact forms and chat system |
| Feedbacks | 5009 | User feedback collection |
| Comments | 5010 | Comments on quizzes and posts |
| Statistics | 5011 | Analytics and reporting |

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- Docker and Docker Compose
- Git

### 1. Clone the Repository
```bash
git clone <repository-url>
cd qb-backend-microservices
```

### 2. Run the Setup Script
```bash
./dev-setup.sh
```

### 3. Start All Services
```bash
# Using Docker Compose (recommended)
docker-compose up -d

# Or using npm scripts
npm run dev-all
```

### 4. Verify Installation
- API Gateway: http://localhost:5000
- Health Check: http://localhost:5000/api/health
- Service Status: http://localhost:5000/api/health

## 📚 API Documentation

Comprehensive API documentation is available in [API_DOCUMENTATION.md](./API_DOCUMENTATION.md).

### Key Endpoints

#### Aggregated Endpoints (Frontend-Friendly)
- `GET /api/aggregated/quiz/:id` - Complete quiz with category, questions, comments, and scores
- `GET /api/aggregated/quizzes` - Quizzes with category names, creator info, and statistics
- `GET /api/aggregated/dashboard` - Comprehensive dashboard statistics from all services
- `GET /api/aggregated/user/:id` - Complete user profile with scores, quizzes, and comments
- `GET /api/aggregated/category/:id` - Category details with related quizzes and questions
- `GET /api/aggregated/search` - Cross-service search across all entities

#### Health Monitoring
- `GET /api/health` - Service health status

## 🔧 Development

### Shared Utilities

The project includes comprehensive shared utilities that can be used across all services:

- **Logger**: Winston-based structured logging with file rotation
- **ServiceClient**: HTTP client with retry logic and circuit breaker patterns
- **Validator**: Joi-based request validation with custom schemas
- **CacheManager**: Redis caching
- **ResponseHandler**: Standardized API response formatting
- **DatabaseManager**: MongoDB connection management with connection pooling

### Individual Service Development
```bash
# Start a specific service
cd quizzing-service
npm run quizzing

# Start all services in development mode
npm run dev-all
```

### Database Management
Each service connects to its own MongoDB database:
- Users: `mongodb://localhost:27017/users`
- Quizzing: `mongodb://localhost:27017/quizzing`
- Posts: `mongodb://localhost:27017/posts`
- etc.

### Environment Variables
Create `.env` files in each service directory:
```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://admin:password123@localhost:27017/service_name?authSource=admin
```

## 🐳 Docker

### Development
```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

### Production
```bash
# Build and start production services
docker-compose -f docker-compose.prod.yml up -d
```

## 📊 Performance Features

### Caching
- **API Gateway Cache**: 5-minute TTL for frequently accessed data
- **Smart Cache Keys**: Based on request parameters and service responses
- **Automatic Invalidation**: Cache expires automatically

### Data Aggregation
- **Single Request**: Get complete data sets in one API call
- **Parallel Processing**: Multiple service calls executed simultaneously
- **Error Handling**: Graceful degradation when services are unavailable

### Database Optimization
- **Connection Pooling**: Optimized MongoDB connections
- **Separate Databases**: Each service uses its own database
- **Efficient Queries**: Minimal database calls through aggregation

## 🔍 Monitoring

### Health Checks
- Individual service health endpoints
- Comprehensive API Gateway health monitoring
- Service response time tracking

### Logging
- Structured logging across all services
- Request/response logging
- Error tracking and reporting

## 🚀 Deployment

### Production Deployment
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy to production
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Configuration
- Production environment variables
- Database connection strings
- Service URLs and ports

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [API_DOCUMENTATION.md](./API_DOCUMENTATION.md)
- **Issues**: Create an issue in the repository
- **Questions**: Contact the development team

## 🔄 Changelog

### Version 2.0.0
- Added data aggregation endpoints
- Implemented intelligent caching
- Enhanced API Gateway with health monitoring
- Added Docker Compose support
- Created shared utilities
- Improved error handling and response formatting

### Version 1.0.0
- Initial microservices architecture
- Basic service separation
- REST API endpoints

---

**Happy Coding! 🚀**
# QB Backend 🚀

Node.js/Express API for QB - a quiz & blog platform with realtime features.

## ✨ Features
- **Quizzing**: Quizzes, questions, categories with scores & comments
- **Content**: Blog posts, adverts, FAQs, courses (chapters/notes/categories), schools (faculties/levels)
- **Realtime**: Socket.io for chat rooms, quiz sessions, broadcasts
- **Social**: Contacts, room messages, user subscriptions, feedbacks, statistics
- **Uploads**: Images/notes/profiles/questions to AWS S3 (multer)
- **Cache**: Redis for efficient data storage
- **Email**: Nodemailer notifications (welcome/OTP/reset/password etc.)
- **DB**: MongoDB/Mongoose with model registry & bootstrap
- **Auth**: JWT + bcrypt, upload/profile middlewares

## 📁 Modules
| Module           | Key Resources                                     |
| ---------------- | ------------------------------------------------- |
| users            | users, subscribed-users, auth                     |
| quizzing         | quizzes, questions, categories                    |
| posts/blog-posts | blog-posts/views/categories/images, adverts, faqs |
| courses          | courses/categories/chapters/notes                 |
| schools          | schools/levels/faculties                          |
| scores           | scores                                            |
| downloads        | downloads                                         |
| feedbacks        | feedbacks                                         |
| comments         | questions-comments, quizzes-comments              |
| contacts         | contacts, chat-rooms, room-messages, broadcasts   |
| statistics       | statistics                                        |

## 🚀 Quick Start

```bash
git clone <repo-url>
cd qb-backend
npm install
npm run dev  # nodemon src/index.js (localhost:3000?)
```

**Docker**:
```bash
docker-compose up -d
```

## 🌐 API
Base: `/api` (e.g., `/api/quizzes`, `/api/users`). Check controllers/routes for endpoints.

## 🔧 Environment (.env)
```
NODE_ENV=development
PORT=3000
MONGODB_URI=mongodb://localhost:27017/qb
JWT_SECRET=your-secret
REDIS_URL=redis://localhost:6379
AWS_S3_BUCKET=your-bucket
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
TWILIO_SID=...  # optional
EMAIL_HOST=...  # nodemailer
```

## 🚀 Deployment
- **Production**: `npm start`
- **Vercel**: `vercel --prod` (vercel.json)
- **Heroku**: Procfile + `npm start`
- **Docker**: docker-compose.yml

## 🔍 Development
- Utils: `mount-routes.js`, `db-manager.js`, `redis-cache.js`, Socket.io handlers/services
- Tests: `npm test` (redis-cache.test.cjs)
- Linting: `eslint .`

MIT License. Contributions welcome!

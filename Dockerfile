FROM node:20-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY --chown=node:node . .

USER node

EXPOSE 4180

CMD ["node", "server/server.js"]

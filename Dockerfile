FROM node:20-bookworm

WORKDIR /app

COPY . .

RUN npm ci
RUN npm run build

EXPOSE 8080

CMD ["node", "build"]

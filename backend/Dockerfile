FROM node:18

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY tsconfig.json ./
COPY src/ ./src

# Build do TypeScript para gerar a pasta dist/
RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]

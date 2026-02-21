FROM node:22-alpine AS build
WORKDIR /app

COPY package*.json ./
COPY tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json

RUN npm install

COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
COPY content ./content

RUN npm run build --workspace @ags/shared && npm run build --workspace @ags/server

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/package.json
COPY --from=build /app/content ./content

EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]
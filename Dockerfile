FROM node:14-alpine
RUN npm install -g nodemon

WORKDIR /home/app
USER node

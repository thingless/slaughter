FROM node:7.4-wheezy

#install deps
RUN mkdir -p /usr/src/app
WORKDIR /usr/src/app
COPY package.json /usr/src/app/
RUN npm install

#copy src
COPY . /usr/src/app
COPY . /usr/src/app

CMD [ "npm", "run", "worker"]
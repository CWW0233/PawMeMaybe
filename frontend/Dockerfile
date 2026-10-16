FROM nginx:1.27-alpine
COPY index.html /usr/share/nginx/html/
COPY css /usr/share/nginx/html/css
COPY images /usr/share/nginx/html/images
COPY js /usr/share/nginx/html/js
# Same-origin API calls in production: swap the local-dev config for the production one
RUN mv /usr/share/nginx/html/js/config.prod.js /usr/share/nginx/html/js/config.js
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

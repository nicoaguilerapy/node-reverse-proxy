# Usa una imagen base de Node.js
FROM node:18

# Establecer el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copiar los archivos de tu aplicación al contenedor
COPY package*.json ./  

# Instalar las dependencias necesarias
RUN npm install --omit=dev

# Copiar todo el código de la aplicación
COPY . .

# Exponer el puerto definido en el .env
EXPOSE ${PORT}

# Comando para ejecutar la aplicación
CMD ["node", "proxy.js"]

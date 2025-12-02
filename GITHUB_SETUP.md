# Инструкция по настройке GitHub репозитория

## Шаги для создания репозитория на GitHub:

1. **Создайте новый репозиторий на GitHub:**
   - Перейдите на https://github.com/new
   - Введите название репозитория (например: `messenger-app`)
   - Выберите публичный или приватный репозиторий
   - **НЕ** инициализируйте репозиторий с README, .gitignore или лицензией (мы уже создали их)

2. **Подключите локальный репозиторий к GitHub:**

   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/messenger-app.git
   git branch -M main
   git push -u origin main
   ```

   Замените `YOUR_USERNAME` на ваш GitHub username и `messenger-app` на название вашего репозитория.

3. **Альтернативный способ (если используете SSH):**

   ```bash
   git remote add origin git@github.com:YOUR_USERNAME/messenger-app.git
   git branch -M main
   git push -u origin main
   ```

## Что уже готово:

✅ Базовая структура проекта
✅ Backend сервер (Node.js + Express + Socket.io)
✅ Веб-приложение (React)
✅ Десктопное приложение (Electron)
✅ Мобильное приложение (React Native + Expo)
✅ Git репозиторий инициализирован
✅ Первый коммит создан

## Следующие шаги:

1. Создайте репозиторий на GitHub
2. Подключите его к локальному репозиторию
3. Установите зависимости:
   ```bash
   npm run install:all
   ```
4. Настройте переменные окружения (скопируйте `backend/env.example` в `backend/.env`)
5. Начните разработку!


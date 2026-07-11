# BIBLIOTECH для Google Play

Это Android-приложение открывает рабочий сайт `https://bibliotech-rjfu.onrender.com` как Trusted Web Activity. Оно использует тот же сервер и PostgreSQL, поэтому аккаунты, книги, комментарии, аренда, бронирования и статистика синхронизируются с сайтом автоматически.

## Параметры приложения

- Название: `BIBLIOTECH`
- Package name: `com.bibliotech.app`
- Версия: `1.0.0` (`versionCode 1`)
- `minSdk`: 23
- `targetSdk`: 35
- Формат для Google Play: Android App Bundle (`.aab`)

## Открытие проекта

Откройте папку `android-app` в Android Studio. Установите Android SDK Platform 36, если Android Studio предложит это сделать.

Для проверки из терминала:

### Windows

```bat
gradlew.bat :app:bundleDebug
```

### macOS / Linux

```bash
chmod +x gradlew
./gradlew :app:bundleDebug
```

Debug bundle появится в:

```text
app/build/outputs/bundle/debug/app-debug.aab
```

## Создание ключа загрузки

Ключ создаётся один раз. Не удаляйте его и не добавляйте в GitHub.

```bash
keytool -genkeypair -v \
  -keystore bibliotech-upload.jks \
  -alias bibliotech \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Скопируйте `keystore.properties.example` в `keystore.properties` и укажите путь и пароли:

```properties
storeFile=/absolute/path/to/bibliotech-upload.jks
storePassword=ВАШ_ПАРОЛЬ
keyAlias=bibliotech
keyPassword=ВАШ_ПАРОЛЬ
```

## Сборка файла для Google Play

```bash
./gradlew :app:bundleRelease
```

На Windows:

```bat
gradlew.bat :app:bundleRelease
```

Готовый файл:

```text
app/build/outputs/bundle/release/app-release.aab
```

## Загрузка в Play Console

1. Создайте приложение с названием `BIBLIOTECH`.
2. Укажите package name `com.bibliotech.app`.
3. Включите Play App Signing.
4. Создайте внутренний тест и загрузите `app-release.aab`.
5. Заполните карточку приложения, политику конфиденциальности, раздел безопасности данных и возрастной рейтинг.
6. Сначала проверьте приложение через внутреннее тестирование, затем отправляйте в production.

## Полноэкранный режим без строки браузера

Trusted Web Activity требует Digital Asset Links. После первой загрузки в Play Console откройте:

`Настройка → Целостность приложения → Сертификат ключа подписи приложения`

Скопируйте SHA-256 fingerprint. Его нужно разместить на сайте по адресу:

```text
https://bibliotech-rjfu.onrender.com/.well-known/assetlinks.json
```

Шаблон находится в `frontend/.well-known/assetlinks.template.json`. Замените `PLAY_APP_SIGNING_SHA256` на fingerprint из Play Console и переименуйте файл в `assetlinks.json` либо настройте серверный endpoint.

До подтверждения Digital Asset Links приложение всё равно откроет сайт, но браузер может показать верхнюю панель. После подтверждения сайт будет открываться как полноценное приложение.

## Обновления

Изменения сайта появляются в приложении автоматически после деплоя Render. Чтобы обновить нативную оболочку в Google Play, увеличьте `versionCode` в `app/build.gradle`, соберите новый `.aab` и загрузите его в Play Console.

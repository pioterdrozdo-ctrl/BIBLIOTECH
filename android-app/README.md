# Android-версия BIBLIOTECH

Папка содержит оболочку Trusted Web Activity для публикации сайта BIBLIOTECH в Google Play. Приложение открывает рабочий сайт `https://bibliotech-rjfu.onrender.com` и использует тот же сервер и базу PostgreSQL. Аккаунты, книги, выдачи, бронирования, комментарии и статистика остаются общими для сайта и Android-приложения.

## Параметры

- название: `BIBLIOTECH`;
- идентификатор пакета: `com.bibliotech.app`;
- версия: `1.0.0` (`versionCode 1`);
- минимальная версия Android: API 23;
- целевая версия Android: API 35;
- формат публикации: Android App Bundle (`.aab`).

## Открытие проекта

Откройте папку `android-app` в Android Studio. Для сборки требуется Android SDK Platform 36 и Java 17.

Проверка из терминала на Windows:

```bat
gradlew.bat :app:bundleDebug
```

На macOS или Linux:

```bash
chmod +x gradlew
./gradlew :app:bundleDebug
```

Отладочная сборка будет сохранена в:

```text
app/build/outputs/bundle/debug/app-debug.aab
```

## Ключ загрузки

Ключ создаётся один раз и используется для последующих обновлений приложения. Его нельзя добавлять в репозиторий или удалять после первой публикации.

```bash
keytool -genkeypair -v \
  -keystore bibliotech-upload.jks \
  -alias bibliotech \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Скопируйте `keystore.properties.example` в `keystore.properties` и заполните параметры:

```properties
storeFile=/absolute/path/to/bibliotech-upload.jks
storePassword=ВАШ_ПАРОЛЬ
keyAlias=bibliotech
keyPassword=ВАШ_ПАРОЛЬ
```

Файл `keystore.properties` и сам ключ исключены из Git и должны храниться отдельно.

## Релизная сборка

macOS или Linux:

```bash
./gradlew :app:bundleRelease
```

Windows:

```bat
gradlew.bat :app:bundleRelease
```

Готовый файл:

```text
app/build/outputs/bundle/release/app-release.aab
```

## Публикация в Google Play

1. Создайте приложение с названием `BIBLIOTECH`.
2. Укажите идентификатор пакета `com.bibliotech.app`.
3. Включите Play App Signing.
4. Создайте внутренний тест и загрузите `app-release.aab`.
5. Заполните карточку приложения, политику конфиденциальности, раздел безопасности данных и возрастной рейтинг.
6. Проверьте сборку во внутреннем тестировании и только после этого переводите её в публикацию.

## Полноэкранный режим

Для работы без панели браузера требуется Digital Asset Links. После загрузки первой сборки откройте в Play Console:

`Настройка → Целостность приложения → Сертификат ключа подписи приложения`

Скопируйте SHA-256 отпечаток сертификата и добавьте его в файл:

```text
https://bibliotech-rjfu.onrender.com/.well-known/assetlinks.json
```

Шаблон находится в `frontend/.well-known/assetlinks.template.json`. Замените `PLAY_APP_SIGNING_SHA256` на отпечаток из Play Console и сохраните результат как `assetlinks.json`.

До подтверждения Digital Asset Links сайт продолжит открываться, но браузер может показывать верхнюю панель.

## Обновления

Изменения сайта становятся доступны после очередного развёртывания на Render. Для обновления Android-оболочки увеличьте `versionCode` в `app/build.gradle`, соберите новый `.aab` и загрузите его в Play Console.

\# Sixmo Form Agent



Автоматический агент для прохождения динамических форм (https://sixmo.ru/) с поддержкой:



\* многошаговых сценариев

\* нестабильного UI

\* загрузки файлов

\* семантического выбора ответов



\## Запуск



```bash

npm install

npm run build

node dist/index.js --input ./skill/examples/request.sample.json

```



\## Пример input



```json

{

&#x20; "url": "https://sixmo.ru/",

&#x20; "fields": \[

&#x20;   { "type": "text", "value": "Букля" },

&#x20;   { "type": "text", "value": "Гриффиндор" },

&#x20;   { "type": "select", "value": "Хогвартс" },

&#x20;   { "type": "file", "value": "./tests/fixtures/sample-upload.txt" }

&#x20; ]

}

```



\## Особенности



\* устойчив к изменению порядка элементов

\* не зависит от фиксированных селекторов

\* использует семантику label/placeholder

\* обходит базовые анти-бот проверки (human-like click)

\* определяет завершение формы без явного UI-сигнала



\## Архитектура



\* `formRunner.ts` — основной workflow

\* `sixmoSkill.ts` — интерфейс skill/tool

\* `index.ts` — CLI вход



\## Результат



```json

{

&#x20; "ok": true,

&#x20; "stepsCompleted": 2,

&#x20; "filledFields": \[...]

}

```




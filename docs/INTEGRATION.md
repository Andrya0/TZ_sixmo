# Интеграция в агент

## Tool signature

Название: `sixmo_form_agent`

Вход: JSON по схеме `skill/input.schema.json`

Выход: JSON:

- `ok`
- `finalUrl`
- `stepsCompleted`
- `filledFields`
- `resultText`
- `artifacts`
- `warnings`

## Пример tool wrapper

```ts
const result = await execa('npm', ['run', 'skill', '--', '--input', requestPath], {
  cwd: repoPath
});
const payload = JSON.parse(result.stdout);
```

## Рекомендуемая стратегия агента

1. Сформировать JSON-input.
2. Подложить локальный файл для upload-поля.
3. Запустить skill.
4. Проверить `ok === true`.
5. При `ok === false` приложить trace и warnings в follow-up reasoning.

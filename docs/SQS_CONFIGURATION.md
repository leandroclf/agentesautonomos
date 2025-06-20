# Configuração SQS Unificada

## Mudanças Implementadas

### Antes
- ElasticMQ (porta 9324) + LocalStack (porta 4566)
- Configuração duplicada e conflitante
- Scripts separados para cada serviço

### Depois
- Apenas LocalStack (porta 4566)
- Configuração unificada
- Script único de inicialização

## Como Usar

```bash
# Novo comando unificado
npm run dev

# Ou diretamente
node scripts/start-unified.js
```

## Benefícios

1. **Simplicidade**: Um único serviço AWS simulado
2. **Consistência**: Todas as configurações apontam para LocalStack
3. **Performance**: Menos containers rodando
4. **Manutenção**: Configuração centralizada

## Rollback

Se necessário, os backups estão em `temp/backup-configs/`

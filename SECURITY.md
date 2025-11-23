# Documentação de Segurança - Exclusive Club

## Controle de Acesso

### Roles (Funções)

O sistema possui dois níveis de acesso:

1. **Admin** - Acesso completo ao sistema
2. **User** - Acesso apenas às funcionalidades de reserva

### Atribuição de Role Admin

**IMPORTANTE**: Apenas o **owner do projeto** (definido pela variável de ambiente `OWNER_OPEN_ID`) recebe automaticamente a role `admin`.

#### Como funciona:

1. Quando um usuário faz login pela primeira vez, o sistema verifica se o `openId` dele corresponde ao `OWNER_OPEN_ID`
2. Se corresponder, o usuário é criado com `role = 'admin'`
3. Caso contrário, o usuário é criado com `role = 'user'` (padrão)

**Código relevante** (`server/db.ts`, linha 57-60):
```typescript
} else if (user.openId === ENV.ownerOpenId) {
  values.role = 'admin';
  updateSet.role = 'admin';
}
```

### Proteção de Rotas Admin

Todas as rotas administrativas são protegidas pelo middleware `adminProcedure` que:

1. Verifica se o usuário está autenticado
2. Verifica se `user.role === 'admin'`
3. Retorna erro `FORBIDDEN` se não for admin

**Código relevante** (`server/_core/trpc.ts`, linha 30-45):
```typescript
export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);
```

### Rotas Protegidas por Admin

As seguintes rotas **só podem ser acessadas pelo owner/admin**:

- `allowedClients.list` - Listar clientes autorizados
- `allowedClients.create` - Criar novo cliente
- `allowedClients.update` - Atualizar cliente
- `allowedClients.delete` - Deletar cliente
- `vessels.listAll` - Listar todas embarcações (incluindo inativas)
- `vessels.create` - Criar embarcação
- `vessels.update` - Atualizar embarcação
- `vessels.delete` - Deletar embarcação
- `bookings.listAll` - Ver todas as reservas
- `bookings.markAsUsed` - Marcar reserva como utilizada
- `bookings.update` - Atualizar status de reserva
- `bookings.delete` - Deletar reserva

### Interface Admin

A interface `/admin` também é protegida:

1. No frontend, o botão "Admin" só aparece se `user.role === 'admin'` (linha 38-42 de `Home.tsx`)
2. Mesmo que alguém tente acessar `/admin` diretamente, as chamadas tRPC falharão com erro `FORBIDDEN`

## Verificação de Segurança

✅ **Apenas o owner do projeto pode:**
- Acessar o painel administrativo
- Gerenciar clientes autorizados
- Gerenciar embarcações
- Ver todas as reservas do sistema
- Modificar status de reservas

✅ **Usuários comuns (não-owner) podem:**
- Fazer login no sistema
- Ver suas próprias reservas (se estiverem na lista de clientes autorizados)
- Criar novas reservas (se autorizados)
- Cancelar suas próprias reservas

✅ **Usuários não autorizados (não na lista allowedClients):**
- Podem fazer login
- Não podem fazer reservas
- Recebem mensagem: "Seu email não está autorizado a fazer reservas"

## Variáveis de Ambiente

- `OWNER_OPEN_ID`: OpenID do owner (você), definido automaticamente pelo sistema Manus
- `OWNER_NAME`: Nome do owner, definido automaticamente pelo sistema Manus

Essas variáveis são injetadas automaticamente e não podem ser modificadas por usuários.

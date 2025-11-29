📘 ARCHITECTURE-DYS-API-FSC.md
DYS-API-FSC — Arquitectura y Convenciones

Este documento define la arquitectura, reglas, estándares y patrones obligatorios para el servicio dys-api-fsc, actuando como un BFF (Backend for Frontend) que integra Falabella Seller Center (FSC) con otros servicios internos.

Su propósito es mantener consistencia, orden, mantenibilidad y escalabilidad en todas las implementaciones presentes y futuras.

🏛️ 1. Arquitectura General — Clean Architecture

El proyecto sigue la estructura basada en Clean Architecture, con 5 capas principales:

src/
  config/            → Variables de entorno, configuración global.
  shared/            → Herramientas transversales (logger, utils, helpers).
  domain/            → Entidades de dominio y contratos (interfaces).
  application/       → Casos de uso (reglas de negocio).
  infrastructure/    → Adaptadores externos (HTTP FSC, DB, mappers).
  interfaces/        → Controladores HTTP, rutas, middlewares.

1.1 Regla fundamental

Las capas solo dependen hacia adentro, nunca hacia afuera:

interfaces → application

application → domain

domain → (sin dependencias)

infrastructure → application / domain (solo por interfaces)

📦 2. Dominio (Domain Layer)

Contiene:

Entities: modelos puros sin lógica de infraestructura.

Repositories (interfaces): contratos abstractos para obtener/guardar datos.

Value Objects cuando corresponde.

❗ Regla:
No incluir nada propio de HTTP, FSC, Express, PDF, buffers, ni JSON específicos.

⚙️ 3. Aplicación (Application Layer)

Contiene:

Use Cases: lógica de negocio orquestada.

DTOs: Entrada/salida del caso de uso.

Servicios específicos (si no pertenecen a infraestructura).

❗ Reglas:

No deben saber de Express, Request, Response, headers, etc.

No deben conocer detalles de FSC, solo el repositorio.

Validaciones van aquí (cuando aplican al flujo).

🌐 4. Infraestructura (Infrastructure Layer)

Contiene:

Adaptadores HTTP hacia FSC.

Repositorios concretos que implementan los contratos del dominio.

Mappers de estructuras FSC → Domain → Application.

❗ Reglas:

Aquí se manejan errores HTTP externos.

Nunca retornar respuestas crudas del servicio externo hacia el controller.

Mapper obligatorio (transformar objetos externos a dominio o DTOs internos).

🖥️ 5. Interfaces (Controllers / Routes)

Entrada/salida del sistema vía HTTP.

Aquí se usan: Express, headers, query params, files, etc.

Filtro de campos (Partial Response Pattern).

Envío de PDF, buffers o JSON.

❗ Regla de oro:
Los controladores solo llaman un caso de uso y formatean la respuesta. Nada de lógica de negocio.

📄 6. Reglas Especiales para Endpoints PDF / Archivos

Los endpoints que devuelven archivos NO deben pasar por el filtrado JSON (Partial Response Pattern).

Ejemplo:
GET /label/order/:orderId

Reglas:

Devuelven buffer

Setean Content-Type y Content-Disposition

No pasan por helpers JSON

No usan fields ni pickFields

🧰 7. Patrón Partial Response / Sparse Fieldsets (JSON)

Este patrón debe aplicarse globalmente pero solo para JSON.

7.1 Utilitario global

Archivo obligatorio:

src/shared/utils/pickFields.ts


Debe:

Recibir un objeto o lista

Filtrar campos según fields=id,name

Si no se envía fields, retorna el JSON completo

No fallar si un campo no existe

7.2 Aplicación en endpoints

En los controllers JSON usar un helper:

import { applyFieldFilter } from "../../shared/utils/applyFieldFilter";
return sendJson(res, applyFieldFilter(result, req.query.fields));

7.3 No aplicarlo en:

PDFs

Buffers

Streams

Archivos generados

🧾 8. Logging

Usar logger centralizado:

src/infrastructure/logger/logger.ts


Reglas:

Logs del controller deben incluir:

endpoint

params

errores

traceId si existe

No exponer API keys

No loggear objetos gigantes innecesarios

No loggear buffers o PDFs

🔒 9. Errores y Manejo de Excepciones

Manejar errores controlados en casos de uso.

En infraestructura, convertir errores externos a errores internos entendibles.

En controllers:

404 cuando aplique

400 para errores de validación

500 para errores no controlados

Middleware obligatorio:

errorHandler.ts

🔐 10. Seguridad Básica

Validar x-api-key cuando corresponda.

Sanitizar parámetros básicos.

No exponer detalles internos en respuestas 500.

🧱 11. Convenciones de Código (TypeScript)

Todo estrictamente tipado (strict: true).

No usar any excepto casos extremos justificados.

Repositorios deben implementar interfaces del dominio.

Use Cases terminan en UseCase.

Controladores terminan en Controller.

Rutas en /interfaces/http/routes/*.ts.

🚀 12. Evolución del Proyecto

Las nuevas funcionalidades deben:

Seguir esta arquitectura.

Mantener el filtrado de campos para JSON.

Mantener consistencia en logging y manejo de errores.

Respetar la separación de capas.

🧠 13. Regla final

No mezclar capas. No duplicar lógica. No introducir lógica de negocio en controllers o infraestructura. Todo flujo de negocio va en la capa application.
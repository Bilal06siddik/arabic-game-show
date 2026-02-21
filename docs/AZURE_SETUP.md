# Azure Setup Guide (Cheapest Path)

This guide deploys the platform on Azure with low traffic cost in mind:

- Frontend: Azure Static Web Apps (Free)
- Backend (Socket.IO): Azure Container Apps (Consumption)

Date context: this guide was prepared on February 20, 2026.

## 1) Prerequisites

- Azure student subscription (active).
- GitHub repository for this project.
- Node.js 22+ and npm 11+.
- Docker Desktop (or Docker Engine).
- Azure CLI installed and logged in.

```bash
az login
az account show
```

## 2) Local Validation Before Deploy

From repo root:

```bash
npm install
npm run build
npm run test
```

## 3) Azure Resource Variables

Use PowerShell (adjust names):

```powershell
$LOCATION = "eastus"
$RG = "ags-prod-rg"
$LOG = "ags-log-workspace"
$ENV = "ags-container-env"
$ACR = "agsacr12345"           # must be globally unique, lowercase
$APP = "ags-server"
$IMAGE = "$ACR.azurecr.io/ags-server:v1"
$SWA = "ags-web"
```

## 4) Create Core Azure Resources

```powershell
az group create --name $RG --location $LOCATION

az monitor log-analytics workspace create `
  --resource-group $RG `
  --workspace-name $LOG `
  --location $LOCATION

$LOG_ID = az monitor log-analytics workspace show --resource-group $RG --workspace-name $LOG --query customerId -o tsv
$LOG_KEY = az monitor log-analytics workspace get-shared-keys --resource-group $RG --workspace-name $LOG --query primarySharedKey -o tsv

az containerapp env create `
  --name $ENV `
  --resource-group $RG `
  --location $LOCATION `
  --logs-workspace-id $LOG_ID `
  --logs-workspace-key $LOG_KEY
```

## 5) Build and Push Backend Image

Create ACR and push image built from `apps/server/Dockerfile`:

```powershell
az acr create --resource-group $RG --name $ACR --sku Basic --admin-enabled true
az acr login --name $ACR

docker build -f apps/server/Dockerfile -t $IMAGE .
docker push $IMAGE
```

## 6) Deploy Backend to Azure Container Apps

Get ACR credentials:

```powershell
$ACR_USER = az acr credential show --name $ACR --query username -o tsv
$ACR_PASS = az acr credential show --name $ACR --query passwords[0].value -o tsv
```

Deploy backend:

```powershell
az containerapp create `
  --name $APP `
  --resource-group $RG `
  --environment $ENV `
  --image $IMAGE `
  --target-port 4000 `
  --ingress external `
  --registry-server "$ACR.azurecr.io" `
  --registry-username $ACR_USER `
  --registry-password $ACR_PASS `
  --cpu 0.25 `
  --memory 0.5Gi `
  --min-replicas 0 `
  --max-replicas 1 `
  --env-vars PORT=4000 CORS_ORIGIN="*"
```

Get backend URL:

```powershell
$BACKEND_FQDN = az containerapp show --name $APP --resource-group $RG --query properties.configuration.ingress.fqdn -o tsv
$BACKEND_URL = "https://$BACKEND_FQDN"
$BACKEND_URL
```

Check health:

```powershell
curl "$BACKEND_URL/health"
```

## 7) Deploy Frontend to Static Web Apps

Recommended: GitHub-integrated deployment.

### Option A: Azure Portal (simplest)

1. Create a Static Web App in Azure Portal.
2. Connect your GitHub repo.
3. Build settings:
- App location: `apps/web`
- API location: *(empty)*
- Output location: `dist`
4. Finish creation; Azure adds a GitHub Actions workflow.

Then add app setting in Static Web Apps:

- `VITE_API_BASE_URL=https://<your-backend-fqdn>`

### Option B: Azure CLI

```powershell
az extension add --name staticwebapp
az staticwebapp create `
  --name $SWA `
  --resource-group $RG `
  --location $LOCATION `
  --source https://github.com/<your-user>/<your-repo> `
  --branch master `
  --app-location "apps/web" `
  --output-location "dist" `
  --login-with-github
```

Set frontend app setting:

```powershell
az staticwebapp appsettings set --name $SWA --resource-group $RG --setting-names VITE_API_BASE_URL=$BACKEND_URL
```

## 8) Lock Down CORS (after SWA URL is known)

Replace wildcard CORS with your SWA domain:

```powershell
$SWA_HOST = "https://<your-static-web-app-domain>"

az containerapp update `
  --name $APP `
  --resource-group $RG `
  --set-env-vars PORT=4000 CORS_ORIGIN=$SWA_HOST
```

## 9) Update Backend on New Deploys

```powershell
$IMAGE = "$ACR.azurecr.io/ags-server:v2"
docker build -f apps/server/Dockerfile -t $IMAGE .
docker push $IMAGE

az containerapp update --name $APP --resource-group $RG --image $IMAGE
```

## 10) Monitoring and Cost Guardrails

## Recommended defaults

- Keep backend at `min-replicas=0` (scales to zero).
- Keep CPU/memory small: `0.25 vCPU / 0.5Gi`.
- Keep `max-replicas=1` initially.

## Configure budget alerts

In Azure Portal:

1. Cost Management + Billing -> Budgets.
2. Create monthly budget (example: `$10`).
3. Alerts at 50%, 80%, 100%.

## Useful log commands

```powershell
az containerapp logs show --name $APP --resource-group $RG --follow
az containerapp revision list --name $APP --resource-group $RG -o table
```

## 11) CI/CD Pipelines (Included in Repo)

Two workflow templates are included:

- `.github/workflows/deploy-web-swa.yml`
- `.github/workflows/deploy-server-containerapp.yml`

Required GitHub secrets:

- `AZURE_STATIC_WEB_APPS_API_TOKEN`
- `VITE_API_BASE_URL`
- `AZURE_CREDENTIALS`
- `ACR_NAME`
- `CONTAINER_APP_NAME`
- `RESOURCE_GROUP`
- `CORS_ORIGIN`

## 12) Custom Domain and SSL

- Static Web Apps: add custom domain directly in SWA settings.
- Container Apps API: add custom domain in Container App ingress settings if needed.

## 13) Troubleshooting

## Web app loads but API fails

- Verify `VITE_API_BASE_URL` in SWA app settings.
- Verify backend URL responds at `/health`.
- Check browser console for CORS mismatch.

## Socket disconnects often

- Confirm frontend uses `https://<backend-fqdn>`.
- Verify Container App is not blocked by ingress/CORS.
- Check server logs using `az containerapp logs show`.

## Room joins fail after reconnect

- Session tokens are rotated on reconnect by design.
- Ensure frontend stores updated `sessionToken` after `/reconnect` response.

## 14) Expected Cost (Low Traffic)

With student/free usage and low concurrent players:

- Static Web Apps Free: typically $0.
- Container Apps Consumption: usually low/near-zero for sporadic sessions, but monitor with budget alerts.
- ACR Basic adds fixed monthly cost; keep it if you need private image hosting. If desired, switch image hosting strategy later.

## 15) Environment Variables Summary

## Backend (Container App)

- `PORT=4000`
- `CORS_ORIGIN=https://<frontend-domain>`

## Frontend (Static Web Apps)

- `VITE_API_BASE_URL=https://<backend-fqdn>`

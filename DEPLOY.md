# Deploying PawMeMaybe to GKE (Google Cloud Shell)

Every command has a `#` comment saying what it does. Run them in order in **Cloud Shell**
(the `>_` button at the top right of the Google Cloud console). Docker, gcloud and kubectl are pre-installed there.

## 0. Variables (re-run these if Cloud Shell restarts)
```bash
# Your GCP project id (shown in the console project picker)
export PROJECT_ID=$(gcloud config get-value project)
# Region and zone close to Australia; a single ZONE makes a "zonal" cluster (cheaper management fee)
export REGION=australia-southeast1
export ZONE=australia-southeast1-a
# Where the Docker images will live
export REPO=$REGION-docker.pkg.dev/$PROJECT_ID/pawme
```

## 1. Get the code
```bash
# Download the project from GitHub (replace with your repository URL)
git clone https://github.com/CWW0233/PawMeMaybe.git
# Move into the project folder
cd PawMeMaybe
```

## 2. Enable the Google services we use (one-off)
```bash
# GKE = Kubernetes Engine; artifactregistry = place to store Docker images
gcloud services enable container.googleapis.com artifactregistry.googleapis.com
```

## 3. Create the image registry and log Docker in
```bash
# Create a Docker image repository called "pawme" in our region
gcloud artifacts repositories create pawme --repository-format=docker --location=$REGION
# Let the docker command push to that registry using your gcloud login
gcloud auth configure-docker $REGION-docker.pkg.dev --quiet
```

## 4. Build the 3 images (version tag v1) and test them in Cloud Shell
```bash
# -f = which Dockerfile, -t = image name:tag, last argument = build context folder (backend/)
docker build -f backend/pet-service/Dockerfile      -t $REPO/pet-service:v1      backend
docker build -f backend/adoption-service/Dockerfile -t $REPO/adoption-service:v1 backend
# Frontend context is the frontend/ folder itself
docker build -t $REPO/frontend:v1 frontend

# Quick local test: run pet-service in the background on port 8001 with throw-away secrets
docker run -d --rm --name t-pet -p 8001:8001 -e JWT_SECRET=local-test-secret-1234567890 $REPO/pet-service:v1
# Wait for startup, then call the health check and the pet list (expect 4 pets)
sleep 5 && curl -s localhost:8001/healthz && curl -s localhost:8001/api/pets | head -c 200
# Stop the test container
docker stop t-pet
```

## 5. Push the images
```bash
# Upload each image to Artifact Registry so the cluster can pull it
docker push $REPO/pet-service:v1
docker push $REPO/adoption-service:v1
docker push $REPO/frontend:v1
```

## 6. Create the Kubernetes cluster (costs money while it exists!)
```bash
# 3 x e2-medium nodes (as in the proposal), 30 GB disk each, in one zone.
# --enable-ip-alias = VPC-native cluster (needed for the container-native load balancer)
gcloud container clusters create pawme --zone $ZONE --num-nodes 3 \
  --machine-type e2-medium --disk-size 30 --enable-ip-alias
# Point kubectl at the new cluster
gcloud container clusters get-credentials pawme --zone $ZONE
```

## 7. Create the secrets (random values, never stored in git)
```bash
# Create the namespace first (all our objects live in "pawme")
kubectl create namespace pawme
# Random passwords/keys: hex keeps them URL-safe for the database URL
export MYSQL_PW=$(openssl rand -hex 12)
export STAFF_PW=$(openssl rand -hex 8)
# Store them as one Kubernetes Secret that the pods read as environment variables
kubectl create secret generic pawme-secrets -n pawme \
  --from-literal=JWT_SECRET=$(openssl rand -hex 32) \
  --from-literal=INTERNAL_API_KEY=$(openssl rand -hex 24) \
  --from-literal=STAFF_PASSWORD=$STAFF_PW \
  --from-literal=MYSQL_ROOT_PASSWORD=$(openssl rand -hex 16) \
  --from-literal=MYSQL_PASSWORD=$MYSQL_PW \
  --from-literal=DATABASE_URL="mysql+pymysql://pawme:$MYSQL_PW@mysql:3306/pawme"
# WRITE THIS DOWN: the staff login for the demo is  staff / <this password>
echo "Staff password: $STAFF_PW"
```

## 8. Deploy everything
```bash
# Database first: MySQL StatefulSet + 5 GB persistent disk + network policy
kubectl apply -f k8s/mysql.yaml
# Wait until MySQL is ready (about 1-2 minutes)
kubectl rollout status statefulset/mysql -n pawme --timeout=300s
# Apps: replace the REGISTRY placeholder with our real registry path, then apply
sed "s#REGISTRY#$REPO#g" k8s/apps.yaml | kubectl apply -f -
# Load balancer (Ingress): creates a public IP and routes /api/... to the right service
kubectl apply -f k8s/ingress.yaml
# Check that all pods become Running (Ctrl+C to stop watching)
kubectl get pods -n pawme -w
```

## 9. Open the website
```bash
# The ADDRESS column shows the public IP (can take 3-10 minutes to appear and start working)
kubectl get ingress pawme -n pawme -w
```
Open `http://<ADDRESS>` in a browser. Sign in as `staff` with the password printed in step 7.

## Demo commands (for the 4-minute presentation)

### A. Scalability (HPA adds pods under load)
```bash
# Show current autoscaler status (TARGETS = CPU use, REPLICAS = number of pods)
kubectl get hpa -n pawme
# Generate traffic from inside the cluster: 3 busy loops hitting pet-service (Ctrl+C to stop later)
kubectl run load -n pawme --image=busybox:1.36 --restart=Never -- /bin/sh -c "while true; do wget -q -O- http://pet-service:8001/api/pets >/dev/null; done"
# Watch the replica count rise (may take 1-2 minutes)
kubectl get hpa -n pawme -w
# Stop the load generator
kubectl delete pod load -n pawme
# Manual alternative (instant): scale pet-service to 4 pods
kubectl scale deployment/pet-service --replicas=4 -n pawme
```

### B. Reliability (kill a pod, site keeps working)
```bash
# List the pet-service pods
kubectl get pods -n pawme -l app=pet-service
# Delete one pod on purpose (replace the name with one from the list above)
kubectl delete pod <POD_NAME> -n pawme
# Kubernetes immediately starts a replacement; refresh the website - it never goes down
kubectl get pods -n pawme -l app=pet-service
```

### C. Rollout and rollback (change version with no downtime)
Before the demo, edit something visible (e.g. the home page title in `frontend/index.html`), then:
```bash
# Build and push a new version of the frontend image tagged v2
docker build -t $REPO/frontend:v2 frontend && docker push $REPO/frontend:v2
```
During the demo:
```bash
# Roll out v2: pods are replaced one by one, the site stays up
kubectl set image deployment/frontend frontend=$REPO/frontend:v2 -n pawme
# Watch the rollout finish
kubectl rollout status deployment/frontend -n pawme
# (Refresh the browser: the new title appears)
# Roll back to the previous version in one command
kubectl rollout undo deployment/frontend -n pawme
# (Refresh the browser: the old title is back)
# Show the version history
kubectl rollout history deployment/frontend -n pawme
```

## Clean up (IMPORTANT: stops the billing)
```bash
# Delete the Ingress first so its load balancer is released
kubectl delete -f k8s/ingress.yaml
# Delete the whole cluster (nodes, disks and everything inside)
gcloud container clusters delete pawme --zone $ZONE --quiet
```
Re-create from step 6 when you need it again. The images in Artifact Registry cost almost nothing and can stay.

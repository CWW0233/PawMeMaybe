# PawMeMaybe 🐾
### Cloud-Native Pet Adoption Microservice Platform
**Course**: INFS3208 Cloud Computing (University of Queensland)  

---

## 📖 Overview
PawMeMaybe is a highly scalable, fault-tolerant cloud-native pet adoption platform deployed on **Google Kubernetes Engine (GKE)**. It decouples core business domains into independent microservices, providing real-time search, adoption applications, and dynamic scaling.

## 🏗️ Architecture
- **Frontend Service**: Lightweight UI built with HTML5, CSS3, and JavaScript.
- **Pet Service**: Python FastAPI microservice handling pet catalogs, profiles, and dynamic multi-criteria search.
- **Adoption Service**: Python FastAPI microservice managing adoption submissions, status tracking, and validation.
- **Database**: MySQL database with persistent volume claims on Google Cloud Persistent Disks.
- **Orchestration**: Docker containers managed via Kubernetes on GKE with Cloud Load Balancing and Horizontal Pod Autoscaling (HPA).

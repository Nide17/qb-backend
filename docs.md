<!-- Setting up environment: .env and .env.docker for every service -->
<!-- Note: copied from users-service.. api-gateway & users-services are required first. -->
./scripts/env-setup.sh

<!-- Dev setup: Installing package.jsons in all services -->
./scripts/dev-setup.sh

<!-- Building Docker Images freshly -->
docker compose build --no-cache
or
docker compose up --build --force-recreate -d

<!-- Starting the services -->
docker compose up -d

<!-- Stopping the services -->
docker compose down

<!-- Viewing the logs -->
docker compose logs

<!-- Live logs -->
docker compose logs  -f
docker compose logs -f | grep -v "mongodb  |"  # To filter out MongoDB logs

- The above are for all services specified in the docker compose file.
- You can specify a particular service by appending its name to the command, e.g., `docker compose logs <service_name>`.
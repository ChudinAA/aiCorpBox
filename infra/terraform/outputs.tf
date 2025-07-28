output "cluster_id" {
  description = "EKS cluster ID"
  value       = aws_eks_cluster.ai_box_cluster.id
}

output "cluster_arn" {
  description = "EKS cluster ARN"
  value       = aws_eks_cluster.ai_box_cluster.arn
}

output "cluster_endpoint" {
  description = "Endpoint for EKS control plane"
  value       = aws_eks_cluster.ai_box_cluster.endpoint
}

output "cluster_security_group_id" {
  description = "Security group ids attached to the cluster control plane"
  value       = aws_eks_cluster.ai_box_cluster.vpc_config[0].cluster_security_group_id
}

output "cluster_iam_role_name" {
  description = "IAM role name associated with EKS cluster"
  value       = aws_iam_role.eks_cluster_role.name
}

output "cluster_iam_role_arn" {
  description = "IAM role ARN associated with EKS cluster"
  value       = aws_iam_role.eks_cluster_role.arn
}

output "cluster_certificate_authority_data" {
  description = "Base64 encoded certificate data required to communicate with the cluster"
  value       = aws_eks_cluster.ai_box_cluster.certificate_authority[0].data
}

output "cluster_primary_security_group_id" {
  description = "Cluster security group that was created by Amazon EKS for the cluster"
  value       = aws_eks_cluster.ai_box_cluster.vpc_config[0].cluster_security_group_id
}

output "node_groups" {
  description = "EKS node groups"
  value       = aws_eks_node_group.ai_box_nodes
}

output "vpc_id" {
  description = "ID of the VPC where the cluster and its nodes will be provisioned"
  value       = aws_vpc.ai_box_vpc.id
}

output "vpc_cidr_block" {
  description = "CIDR block of the VPC"
  value       = aws_vpc.ai_box_vpc.cidr_block
}

output "public_subnets" {
  description = "List of IDs of public subnets"
  value       = aws_subnet.public_subnets[*].id
}

output "private_subnets" {
  description = "List of IDs of private subnets"
  value       = aws_subnet.private_subnets[*].id
}

output "kubeconfig_command" {
  description = "Command to update kubeconfig"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.ai_box_cluster.name}"
}

output "load_balancer_controller_role_arn" {
  description = "ARN of the AWS Load Balancer Controller IAM role"
  value       = aws_iam_role.aws_load_balancer_controller.arn
}

# Connection information
output "database_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_eks_cluster.ai_box_cluster.endpoint
  sensitive   = true
}

output "monitoring_endpoints" {
  description = "Monitoring service endpoints"
  value = {
    prometheus = "http://prometheus.${var.project_name}.local:9090"
    grafana    = "http://grafana.${var.project_name}.local:3000"
  }
}
